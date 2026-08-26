import { SubscriptionStatus } from '@prisma/client';
import { paymentStatusOf } from './loyalty.service';

/**
 * A coluna "Pagamento" da aba Fidelidade (`Dashboard.dc.html` l.1567) é a
 * ÚNICA informação derivada da tela: não há campo no banco dizendo "Pago" —
 * sai do cruzamento do `Payment` do ciclo com o `nextChargeAt`. Um erro aqui
 * mostra "Pago" para quem deve, que é o pior jeito de errar nesta aba.
 */
describe('paymentStatusOf', () => {
  const periodStart = new Date('2026-08-01T00:00:00Z');
  const now = new Date('2026-08-20T12:00:00Z');
  const future = new Date('2026-09-05T00:00:00Z');
  const past = new Date('2026-08-05T00:00:00Z');

  it('quitado dentro do ciclo é Pago', () => {
    expect(
      paymentStatusOf({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        nextChargeAt: future,
        lastPaidAt: new Date('2026-08-02T10:00:00Z'),
        now,
      }),
    ).toBe('PAID');
  });

  it('pagamento do ciclo ANTERIOR não conta como pago', () => {
    expect(
      paymentStatusOf({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        nextChargeAt: future,
        lastPaidAt: new Date('2026-07-05T10:00:00Z'),
        now,
      }),
    ).toBe('PENDING');
  });

  it('sem pagamento e com cobrança no futuro é Pendente', () => {
    expect(
      paymentStatusOf({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        nextChargeAt: future,
        lastPaidAt: null,
        now,
      }),
    ).toBe('PENDING');
  });

  it('cobrança vencida sem quitação é Atrasado', () => {
    expect(
      paymentStatusOf({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        nextChargeAt: past,
        lastPaidAt: null,
        now,
      }),
    ).toBe('OVERDUE');
  });

  it('PAST_DUE é Atrasado mesmo com a cobrança ainda por vir', () => {
    expect(
      paymentStatusOf({
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodStart: periodStart,
        nextChargeAt: future,
        lastPaidAt: null,
        now,
      }),
    ).toBe('OVERDUE');
  });

  it('PAST_DUE já regularizado no ciclo volta a ser Pago', () => {
    expect(
      paymentStatusOf({
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodStart: periodStart,
        nextChargeAt: past,
        lastPaidAt: new Date('2026-08-19T09:00:00Z'),
        now,
      }),
    ).toBe('PAID');
  });

  it('pausada não fatura — nem "Pago" com pagamento antigo, nem "Atrasado" com cobrança vencida', () => {
    expect(
      paymentStatusOf({
        status: SubscriptionStatus.PAUSED,
        currentPeriodStart: periodStart,
        nextChargeAt: past,
        lastPaidAt: new Date('2026-08-02T10:00:00Z'),
        now,
      }),
    ).toBe('PAUSED');
  });
});
