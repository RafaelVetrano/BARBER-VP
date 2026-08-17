import { SubscriptionRenewalService } from './subscription-renewal.service';
import type { ClientSubscriptionService } from './client-subscription.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * `runOnce()` é a peça que a fila BullMQ da fase 09 vai agendar sem tocar em
 * uma linha deste arquivo — testada isolada, como o SPEC pede ("a lógica de
 * renovação deve existir e ser testável isoladamente").
 */
describe('SubscriptionRenewalService', () => {
  const logger = { setContext: jest.fn(), error: jest.fn(), info: jest.fn() } as never;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as never;

  function build(due: Array<{ id: string; tenantId: string; clientId: string }>, renewCycle: jest.Mock) {
    const prisma = {
      clientSubscription: { findMany: jest.fn().mockResolvedValue(due) },
    } as unknown as PrismaService;
    const subscriptions = { renewCycle } as unknown as ClientSubscriptionService;

    return new SubscriptionRenewalService(prisma, logger, audit, subscriptions);
  }

  it('não faz nada quando nenhuma assinatura está vencida', async () => {
    const renewCycle = jest.fn();
    const service = build([], renewCycle);

    const summary = await service.runOnce();

    expect(summary).toEqual({ due: 0, renewed: 0, failed: 0 });
    expect(renewCycle).not.toHaveBeenCalled();
  });

  it('renova cada assinatura vencida, uma por uma', async () => {
    const renewCycle = jest.fn().mockResolvedValue({});
    const due = [
      { id: 'sub-1', tenantId: 't1', clientId: 'c1' },
      { id: 'sub-2', tenantId: 't1', clientId: 'c2' },
    ];
    const service = build(due, renewCycle);

    const summary = await service.runOnce();

    expect(summary).toEqual({ due: 2, renewed: 2, failed: 0 });
    expect(renewCycle).toHaveBeenNthCalledWith(1, 'sub-1');
    expect(renewCycle).toHaveBeenNthCalledWith(2, 'sub-2');
  });

  it('uma renovação falha não derruba as demais — conta em `failed`', async () => {
    const renewCycle = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('gateway fora do ar'))
      .mockResolvedValueOnce({});
    const due = [
      { id: 'sub-1', tenantId: 't1', clientId: 'c1' },
      { id: 'sub-2', tenantId: 't1', clientId: 'c2' },
      { id: 'sub-3', tenantId: 't1', clientId: 'c3' },
    ];
    const service = build(due, renewCycle);

    const summary = await service.runOnce();

    expect(summary).toEqual({ due: 3, renewed: 2, failed: 1 });
  });

  it('só busca assinaturas ACTIVE/PAST_DUE vencidas — pausada não entra na varredura', async () => {
    const renewCycle = jest.fn();
    const prisma = {
      clientSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new SubscriptionRenewalService(
      prisma,
      logger,
      audit,
      { renewCycle } as unknown as ClientSubscriptionService,
    );

    const now = new Date('2026-09-06T00:00:00Z');
    await service.runOnce(now);

    expect(prisma.clientSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['ACTIVE', 'PAST_DUE'] },
          currentPeriodEnd: { lte: now },
        }),
      }),
    );
  });
});
