import { Injectable } from '@nestjs/common';
import { PaymentStatus, SubscriptionStatus } from '@prisma/client';
import type {
  ClientPlanAdminItem,
  LoyaltyProgramConfig,
  SubscriberItem,
  SubscriptionPaymentStatus,
  UpdateLoyaltyProgramDto as UpdateLoyaltyProgramContract,
  UpsertClientPlanDto as UpsertClientPlanContract,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { ClientSubscriptionService } from '../client-account/client-subscription.service';

/** Assinaturas que ainda geram receita — `PAUSED` não fatura, `CANCELED` saiu. */
const BILLING_STATUSES = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] as const;

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subscriptions: ClientSubscriptionService,
  ) {}

  // ── Programa de pontos ───────────────────────────────────────────────────
  //
  // Sem tela desde a revisão do protótipo (a sub-aba "Pontos" saiu do desenho),
  // mas o recurso continua vivo: a comanda resgata pontos e a aba Clientes
  // mostra o saldo. O endpoint permanece porque é o único interruptor do
  // programa — realojá-lo em Configurações é dívida registrada no CONTEXT.

  async programConfig(tenantId: string): Promise<LoyaltyProgramConfig> {
    const program = await this.prisma.loyaltyProgram.findUnique({ where: { tenantId } });
    return {
      active: program?.active ?? false,
      gastoPorPonto: program?.gastoPorPonto ?? 100,
      pontosParaDesconto: program?.pontosParaDesconto ?? 100,
      valorDesconto: program?.valorDesconto ?? 1_000,
      expiracaoMeses: program?.expiracaoMeses ?? null,
    };
  }

  async updateProgram(
    tenantId: string,
    dto: UpdateLoyaltyProgramContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<LoyaltyProgramConfig> {
    const program = await this.prisma.loyaltyProgram.upsert({
      where: { tenantId },
      update: {
        active: dto.active,
        gastoPorPonto: dto.gastoPorPonto,
        pontosParaDesconto: dto.pontosParaDesconto,
        valorDesconto: dto.valorDesconto,
        expiracaoMeses: dto.expiracaoMeses,
      },
      create: {
        tenantId,
        active: dto.active ?? false,
        gastoPorPonto: dto.gastoPorPonto ?? 100,
        pontosParaDesconto: dto.pontosParaDesconto ?? 100,
        valorDesconto: dto.valorDesconto ?? 1_000,
        expiracaoMeses: dto.expiracaoMeses ?? null,
      },
    });

    await this.audit.record(
      {
        action: AuditAction.LOYALTY_PROGRAM_UPDATED,
        entity: 'LoyaltyProgram',
        entityId: program.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return {
      active: program.active,
      gastoPorPonto: program.gastoPorPonto,
      pontosParaDesconto: program.pontosParaDesconto,
      valorDesconto: program.valorDesconto,
      expiracaoMeses: program.expiracaoMeses,
    };
  }

  // ── Planos de assinatura (lado da barbearia) ────────────────────────────

  /**
   * Os cards do protótipo (l.1526–1547), arquivados inclusos — o desenho tem
   * um card esmaecido com selo "Arquivado" e botão "Reativar", então a lista
   * NÃO pode filtrar por `active`. Arquivados vão para o fim: o dono trabalha
   * nos planos que vende.
   */
  async listPlans(tenantId: string): Promise<ClientPlanAdminItem[]> {
    const plans = await this.prisma.clientPlan.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        items: { include: { service: { select: { name: true } } } },
        _count: {
          select: {
            subscriptions: { where: { status: { not: SubscriptionStatus.CANCELED } } },
          },
        },
      },
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const planIds = plans.map((plan) => plan.id);
    // MRR e "pode excluir" pedem recortes diferentes do mesmo vínculo: o
    // primeiro conta só quem fatura, o segundo conta QUALQUER assinatura —
    // inclusive as canceladas, que seguram a chave estrangeira.
    const [billing, everSubscribed] = await Promise.all([
      this.prisma.clientSubscription.groupBy({
        by: ['planId'],
        where: { tenantId, planId: { in: planIds }, status: { in: [...BILLING_STATUSES] } },
        _count: { _all: true },
      }),
      this.prisma.clientSubscription.groupBy({
        by: ['planId'],
        where: { tenantId, planId: { in: planIds } },
        _count: { _all: true },
      }),
    ]);

    const billingOf = new Map(billing.map((row) => [row.planId, row._count._all]));
    const anySubOf = new Map(everSubscribed.map((row) => [row.planId, row._count._all]));

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceCents: plan.priceCents,
      billingDay: plan.billingDay,
      isPopular: plan.isPopular,
      active: plan.active,
      items: plan.items.map((item) => ({
        serviceId: item.serviceId,
        serviceName: item.service.name,
        quota: item.quota,
      })),
      subscriberCount: plan._count.subscriptions,
      mrrCents: plan.priceCents * (billingOf.get(plan.id) ?? 0),
      canDelete: (anySubOf.get(plan.id) ?? 0) === 0,
    }));
  }

  async upsertPlan(
    tenantId: string,
    id: string | undefined,
    dto: UpsertClientPlanContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ClientPlanAdminItem> {
    if (id) {
      const existing = await this.prisma.clientPlan.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) {
        throw ApiException.notFound('Plano não encontrado.');
      }
    }

    const serviceIds = dto.items.map((item) => item.serviceId);
    if (new Set(serviceIds).size !== serviceIds.length) {
      throw ApiException.badRequest('O mesmo serviço aparece duas vezes no plano.');
    }
    const count = await this.prisma.service.count({ where: { id: { in: serviceIds }, tenantId } });
    if (count !== serviceIds.length) {
      throw ApiException.badRequest('Um ou mais serviços não pertencem a esta barbearia.');
    }

    // `@@unique([tenantId, name])` — sem esta checagem o dono levaria um 500 de
    // violação de chave em vez de saber que já existe um plano com o nome.
    const duplicate = await this.prisma.clientPlan.findFirst({
      where: { tenantId, name: dto.name, deletedAt: null, ...(id ? { NOT: { id } } : {}) },
      select: { id: true },
    });
    if (duplicate) {
      throw ApiException.conflict('Já existe um plano com esse nome.', 'CLIENT_PLAN_NAME_TAKEN');
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const plan = id
        ? await tx.clientPlan.update({
            where: { id },
            data: {
              name: dto.name,
              description: dto.description ?? null,
              priceCents: dto.priceCents,
              billingDay: dto.billingDay ?? 5,
              isPopular: dto.isPopular ?? false,
              items: { deleteMany: {} },
            },
          })
        : await tx.clientPlan.create({
            data: {
              tenantId,
              name: dto.name,
              description: dto.description ?? null,
              priceCents: dto.priceCents,
              billingDay: dto.billingDay ?? 5,
              isPopular: dto.isPopular ?? false,
            },
          });

      await tx.clientPlanItem.createMany({
        data: dto.items.map((item) => ({
          tenantId,
          planId: plan.id,
          serviceId: item.serviceId,
          quota: item.quota,
        })),
      });

      return plan;
    });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_PLAN_UPSERTED,
        entity: 'ClientPlan',
        entityId: saved.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return this.planById(tenantId, saved.id);
  }

  /** "Arquivar plano" — some da vitrine do cliente, quem já assina continua. */
  async archivePlan(
    tenantId: string,
    id: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ClientPlanAdminItem> {
    await this.loadPlan(tenantId, id);
    await this.prisma.clientPlan.update({ where: { id }, data: { active: false } });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_PLAN_ARCHIVED,
        entity: 'ClientPlan',
        entityId: id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return this.planById(tenantId, id);
  }

  /** Botão "Reativar" do card arquivado (protótipo l.1543). */
  async reactivatePlan(
    tenantId: string,
    id: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ClientPlanAdminItem> {
    await this.loadPlan(tenantId, id);
    await this.prisma.clientPlan.update({ where: { id }, data: { active: true } });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_PLAN_REACTIVATED,
        entity: 'ClientPlan',
        entityId: id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return this.planById(tenantId, id);
  }

  /**
   * "Excluir plano" — só quando NENHUMA assinatura aponta para ele, nem
   * cancelada. Com histórico o diálogo do protótipo (l.3384) já oferece
   * arquivar no lugar; o 409 daqui é a mesma regra do lado do servidor, para
   * quem chamar a rota direto.
   */
  async deletePlan(
    tenantId: string,
    id: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<void> {
    await this.loadPlan(tenantId, id);

    const subscriptions = await this.prisma.clientSubscription.count({ where: { tenantId, planId: id } });
    if (subscriptions > 0) {
      throw ApiException.conflict(
        'Este plano já teve assinantes. Arquive-o para tirá-lo da vitrine sem afetar o histórico.',
        'CLIENT_PLAN_HAS_SUBSCRIBERS',
      );
    }

    // Sem assinatura nenhuma o vínculo é só com `ClientPlanItem` (cascata), então
    // some de vez — e o nome volta a ficar livre para um plano novo.
    await this.prisma.clientPlan.delete({ where: { id } });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_PLAN_DELETED,
        entity: 'ClientPlan',
        entityId: id,
        tenantId,
        actorUserId,
      },
      request,
    );
  }

  // ── Assinantes ───────────────────────────────────────────────────────────

  async subscribers(tenantId: string): Promise<SubscriberItem[]> {
    const subs = await this.prisma.clientSubscription.findMany({
      where: { tenantId, status: { not: SubscriptionStatus.CANCELED } },
      include: {
        client: { select: { name: true } },
        plan: { select: { name: true } },
        usages: { include: { service: { select: { name: true } } } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    if (subs.length === 0) {
      return [];
    }

    // Um pagamento QUITADO dentro do ciclo corrente é o que separa "Pago" de
    // "Pendente" — a data de referência é o início do período de cada
    // assinatura, não um mês de calendário comum a todas.
    const paid = await this.prisma.payment.findMany({
      where: {
        tenantId,
        clientSubscriptionId: { in: subs.map((sub) => sub.id) },
        status: PaymentStatus.PAID,
        deletedAt: null,
      },
      select: { clientSubscriptionId: true, paidAt: true },
    });

    const lastPaidAt = new Map<string, Date>();
    for (const payment of paid) {
      const when = payment.paidAt;
      const key = payment.clientSubscriptionId;
      if (!when || !key) continue;
      const current = lastPaidAt.get(key);
      if (!current || when > current) lastPaidAt.set(key, when);
    }

    const now = new Date();

    return subs.map((sub) => {
      const usages = sub.usages.map((usage) => ({
        serviceName: usage.service.name,
        used: usage.used,
        quota: usage.quota,
      }));

      return {
        subscriptionId: sub.id,
        clientId: sub.clientId,
        clientName: sub.client.name,
        planId: sub.planId,
        planName: sub.plan.name,
        status: sub.status,
        paymentStatus: paymentStatusOf({
          status: sub.status,
          currentPeriodStart: sub.currentPeriodStart,
          nextChargeAt: sub.nextChargeAt,
          lastPaidAt: lastPaidAt.get(sub.id) ?? null,
          now,
        }),
        usages,
        usedTotal: usages.reduce((total, usage) => total + usage.used, 0),
        quotaTotal: usages.reduce((total, usage) => total + usage.quota, 0),
        nextChargeAt: sub.nextChargeAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * "Pausar"/"Cancelar"/"Retomar" do menu da tabela (protótipo l.1583–1585).
   *
   * Delegam para o MESMO `ClientSubscriptionService` da área do cliente: a
   * regra de retomada (ciclo vencido reinicia, ciclo vivo só destrava) e a de
   * cancelamento (sem estorno, perde os usos) não podem divergir só porque
   * quem clicou foi o dono.
   */
  async pauseSubscriber(
    tenantId: string,
    subscriptionId: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<SubscriberItem> {
    const clientId = await this.subscriberClientId(tenantId, subscriptionId);
    await this.subscriptions.pause(tenantId, clientId, request, actorUserId);
    return this.subscriberById(tenantId, subscriptionId);
  }

  async resumeSubscriber(
    tenantId: string,
    subscriptionId: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<SubscriberItem> {
    const clientId = await this.subscriberClientId(tenantId, subscriptionId);
    await this.subscriptions.resume(tenantId, clientId, request, actorUserId);
    return this.subscriberById(tenantId, subscriptionId);
  }

  async cancelSubscriber(
    tenantId: string,
    subscriptionId: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<void> {
    const clientId = await this.subscriberClientId(tenantId, subscriptionId);
    await this.subscriptions.cancel(tenantId, clientId, request, actorUserId);
  }

  // ── Apoio ────────────────────────────────────────────────────────────────

  private async loadPlan(tenantId: string, id: string): Promise<{ id: string }> {
    const plan = await this.prisma.clientPlan.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!plan) {
      throw ApiException.notFound('Plano não encontrado.');
    }
    return plan;
  }

  private async planById(tenantId: string, id: string): Promise<ClientPlanAdminItem> {
    const plans = await this.listPlans(tenantId);
    const plan = plans.find((item) => item.id === id);
    if (!plan) {
      throw ApiException.notFound('Plano não encontrado.');
    }
    return plan;
  }

  private async subscriberClientId(tenantId: string, subscriptionId: string): Promise<string> {
    const subscription = await this.prisma.clientSubscription.findFirst({
      where: { id: subscriptionId, tenantId },
      select: { clientId: true },
    });
    if (!subscription) {
      throw ApiException.notFound('Assinatura não encontrada.');
    }
    return subscription.clientId;
  }

  private async subscriberById(tenantId: string, subscriptionId: string): Promise<SubscriberItem> {
    const rows = await this.subscribers(tenantId);
    const row = rows.find((item) => item.subscriptionId === subscriptionId);
    if (!row) {
      throw ApiException.notFound('Assinatura não encontrada.');
    }
    return row;
  }
}

/**
 * A coluna "Pagamento" não existe no banco — é a leitura do ciclo corrente:
 *
 * - pausada ⇒ `PAUSED` (não fatura enquanto estiver assim);
 * - pago dentro do ciclo ⇒ `PAID`;
 * - `PAST_DUE`, ou cobrança já vencida sem quitação ⇒ `OVERDUE`;
 * - resto ⇒ `PENDING` (cobrança ainda por vir).
 *
 * Exportada para o teste unitário — é a única regra derivada da aba.
 */
export function paymentStatusOf(input: {
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  nextChargeAt: Date | null;
  lastPaidAt: Date | null;
  now: Date;
}): SubscriptionPaymentStatus {
  if (input.status === SubscriptionStatus.PAUSED) {
    return 'PAUSED';
  }
  if (input.lastPaidAt && input.lastPaidAt >= input.currentPeriodStart) {
    return 'PAID';
  }
  if (input.status === SubscriptionStatus.PAST_DUE) {
    return 'OVERDUE';
  }
  if (input.nextChargeAt && input.nextChargeAt < input.now) {
    return 'OVERDUE';
  }
  return 'PENDING';
}
