import { SubscriptionStatus } from '@prisma/client';
import { ClientSubscriptionService } from './client-subscription.service';
import type { PaymentAdapter } from '../adapters/payment/payment.adapter';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * A escrita de assinatura (`subscribe`/`pause`/`resume`/`cancel`) contra um
 * Prisma e um `PaymentAdapter` de mentira — o mesmo espírito de
 * `guest-risk.service.spec.ts`: as regras de negócio importam, o banco de
 * verdade não. `renewCycle`/o job em si ganham teste próprio em
 * `subscription-renewal.service.spec.ts`.
 */
describe('ClientSubscriptionService', () => {
  const logger = { setContext: jest.fn(), error: jest.fn(), info: jest.fn() } as never;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as never;

  function fakePayments(): jest.Mocked<PaymentAdapter> {
    return {
      createCharge: jest.fn(),
      createSubscription: jest.fn().mockResolvedValue({
        externalId: 'mock_1',
        status: 'PENDING',
        amountCents: 15_000,
        paymentUrl: null,
        pixPayload: null,
        dueDate: new Date('2026-09-05T12:00:00Z'),
        createdAt: new Date(),
      }),
      getCharge: jest.fn(),
      cancelCharge: jest.fn(),
      refundCharge: jest.fn(),
      simulateTransition: jest.fn().mockResolvedValue({}),
    };
  }

  function fakePrisma(overrides: Record<string, unknown> = {}) {
    return {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({
          plan: { features: { fidelidadeAssinaturas: true } },
        }),
      },
      clientSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      clientPlan: { findFirst: jest.fn() },
      client: { findFirst: jest.fn().mockResolvedValue({ name: 'André', phone: '5511999990001', email: null }) },
      payment: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(txStub)),
      ...overrides,
    } as unknown as PrismaService;
  }

  const txStub = {
    clientSubscription: { create: jest.fn(), update: jest.fn() },
    payment: { create: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recusa assinar quando o tenant não tem fidelidadeAssinaturas no plano', async () => {
    const prisma = fakePrisma({
      tenant: { findFirst: jest.fn().mockResolvedValue({ plan: { features: {} } }) },
    });
    const service = new ClientSubscriptionService(prisma, logger, audit, fakePayments());

    await expect(
      service.subscribe('t1', 'c1', { planId: 'p1', paymentMethod: 'PIX' }, {} as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('recusa assinar quando já existe assinatura não cancelada', async () => {
    const prisma = fakePrisma({
      clientSubscription: { findFirst: jest.fn().mockResolvedValue({ id: 'sub-existente' }) },
    });
    const service = new ClientSubscriptionService(prisma, logger, audit, fakePayments());

    await expect(
      service.subscribe('t1', 'c1', { planId: 'p1', paymentMethod: 'PIX' }, {} as never),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('assina: cobra, confirma e cria a assinatura com uso zerado', async () => {
    const plan = {
      id: 'p1',
      name: 'Corte + Barba Quinzenal',
      priceCents: 15_000,
      billingDay: 5,
      items: [
        { serviceId: 's-corte', quota: 2 },
        { serviceId: 's-barba', quota: 2 },
      ],
    };
    const created = {
      id: 'sub-1',
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date('2026-09-05T12:00:00Z'),
      nextChargeAt: new Date('2026-09-05T12:00:00Z'),
      plan: { name: plan.name, priceCents: plan.priceCents },
      usages: [],
    };
    txStub.clientSubscription.create.mockResolvedValue(created);

    const prisma = fakePrisma({ clientPlan: { findFirst: jest.fn().mockResolvedValue(plan) } });
    const payments = fakePayments();
    const service = new ClientSubscriptionService(prisma, logger, audit, payments);

    const result = await service.subscribe(
      't1',
      'c1',
      { planId: 'p1', paymentMethod: 'CREDIT_CARD', card: { number: '4111111111111111', expiry: '12/28', cvv: '123', holderName: 'Teste' } },
      {} as never,
    );

    expect(payments.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 15_000, billingDay: 5, billingType: 'CREDIT_CARD' }),
    );
    // Mock aprova na hora: PENDING → CONFIRMED → RECEIVED, sem depender de admin.
    expect(payments.simulateTransition).toHaveBeenNthCalledWith(1, 'mock_1', 'CONFIRMED');
    expect(payments.simulateTransition).toHaveBeenNthCalledWith(2, 'mock_1', 'RECEIVED');
    expect(txStub.clientSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          usages: { create: expect.arrayContaining([expect.objectContaining({ quota: 2, used: 0 })]) },
        }),
      }),
    );
    // O número/CVV completos nunca chegam ao registro persistido — só os 4 últimos.
    expect(txStub.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ metadata: { last4: '1111' } }) }),
    );
    expect(result.id).toBe('sub-1');
  });

  it('pausar recusa quando já está pausada', async () => {
    const prisma = fakePrisma({
      clientSubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sub-1', status: SubscriptionStatus.PAUSED }),
      },
    });
    const service = new ClientSubscriptionService(prisma, logger, audit, fakePayments());

    await expect(service.pause('t1', 'c1', {} as never)).rejects.toMatchObject({ status: 409 });
  });

  it('reativar dentro do ciclo só destrava, sem cobrar de novo', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const prisma = fakePrisma({
      clientSubscription: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sub-1', status: SubscriptionStatus.PAUSED, currentPeriodEnd: future }),
        update: jest.fn().mockResolvedValue({
          id: 'sub-1',
          planId: 'p1',
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: future,
          nextChargeAt: future,
          plan: { name: 'Plano', priceCents: 1000 },
          usages: [],
        }),
      },
    });
    const payments = fakePayments();
    const service = new ClientSubscriptionService(prisma, logger, audit, payments);

    const result = await service.resume('t1', 'c1', {} as never);

    expect(payments.createSubscription).not.toHaveBeenCalled();
    expect(result.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('reativar com ciclo vencido dispara cobrança nova (renewCycle)', async () => {
    const past = new Date(Date.now() - 86_400_000);
    const prisma = fakePrisma({
      clientSubscription: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sub-1', status: SubscriptionStatus.PAUSED, currentPeriodEnd: past }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'sub-1',
          tenantId: 't1',
          clientId: 'c1',
          plan: { name: 'Plano', priceCents: 1000, billingDay: 5, items: [{ serviceId: 's1', quota: 4 }] },
        }),
      },
    });
    txStub.clientSubscription.update.mockResolvedValue({
      id: 'sub-1',
      planId: 'p1',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(),
      nextChargeAt: new Date(),
      plan: { name: 'Plano', priceCents: 1000 },
      usages: [],
    });
    const payments = fakePayments();
    const service = new ClientSubscriptionService(prisma, logger, audit, payments);

    await service.resume('t1', 'c1', {} as never);

    expect(payments.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: 'sub-1' }),
    );
  });

  it('cancelar zera a próxima cobrança e não estorna uso', async () => {
    const prisma = fakePrisma({
      clientSubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sub-1', status: SubscriptionStatus.ACTIVE }),
        update: jest.fn().mockResolvedValue({
          id: 'sub-1',
          planId: 'p1',
          status: SubscriptionStatus.CANCELED,
          currentPeriodEnd: new Date(),
          nextChargeAt: null,
          plan: { name: 'Plano', priceCents: 1000 },
          usages: [],
        }),
      },
    });
    const service = new ClientSubscriptionService(prisma, logger, audit, fakePayments());

    const result = await service.cancel('t1', 'c1', {} as never);

    expect(result.status).toBe(SubscriptionStatus.CANCELED);
    expect(prisma.clientSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nextChargeAt: null }) }),
    );
  });
});
