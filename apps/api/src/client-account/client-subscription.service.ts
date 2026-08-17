import { Inject, Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, SubscriptionStatus } from '@prisma/client';
import { hasFeature, type ClientPlanDetail, type ClientSubscriptionAccount, type ClientSubscriptionDetail } from '@barbervp/types';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { PAYMENT_ADAPTER, type PaymentAdapter } from '../adapters/payment/payment.adapter';
import type { RequestContext } from '../common/types/request-context';
import type { SubscribeDto } from './dto/client-account.dto';

/** Quantas cobranças recentes o histórico da `MinhaConta` mostra. */
const BILLING_HISTORY_LIMIT = 24;

/**
 * Assinatura/fidelidade do cliente (`AssinaturaCliente.dc.html` +
 * `MinhaConta` → aba "Assinatura").
 *
 * A leitura da cobertura (quem tem saldo, o débito atômico ao agendar) já
 * existe desde a fase 04 em `SubscriptionCoverageService` — este serviço é a
 * ESCRITA que faltava: vender o plano, cobrar (mock), pausar, reativar,
 * cancelar e renovar o ciclo.
 */
@Injectable()
export class ClientSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly audit: AuditService,
    @Inject(PAYMENT_ADAPTER) private readonly payments: PaymentAdapter,
  ) {
    this.logger.setContext(ClientSubscriptionService.name);
  }

  // ── Vitrine ───────────────────────────────────────────────────────────────

  async plans(tenantId: string): Promise<ClientPlanDetail[]> {
    await this.assertFeatureEnabled(tenantId);

    const plans = await this.prisma.clientPlan.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: { items: { include: { service: { select: { name: true, priceCents: true } } } } },
    });

    return plans.map((plan) => {
      const avulsoTotal = plan.items.reduce(
        (total, item) => total + item.service.priceCents * item.quota,
        0,
      );
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        billingDay: plan.billingDay,
        isPopular: plan.isPopular,
        items: plan.items.map((item) => ({
          serviceId: item.serviceId,
          serviceName: item.service.name,
          quota: item.quota,
        })),
        savingsCents: Math.max(0, avulsoTotal - plan.priceCents),
      };
    });
  }

  // ── Estado atual ─────────────────────────────────────────────────────────

  async current(tenantId: string, clientId: string): Promise<ClientSubscriptionAccount> {
    const enabled = await this.featureEnabled(tenantId);

    const subscription = await this.prisma.clientSubscription.findFirst({
      where: { tenantId, clientId, status: { not: SubscriptionStatus.CANCELED } },
      orderBy: { startedAt: 'desc' },
      include: {
        plan: { select: { name: true, priceCents: true } },
        usages: { include: { service: { select: { name: true } } } },
      },
    });

    const billingHistory = await this.prisma.payment.findMany({
      where: { tenantId, clientSubscription: { tenantId, clientId } },
      orderBy: { createdAt: 'desc' },
      take: BILLING_HISTORY_LIMIT,
      select: { id: true, amountCents: true, status: true, method: true, paidAt: true, createdAt: true },
    });

    return {
      enabled,
      subscription: subscription ? this.toDetail(subscription) : null,
      billingHistory: billingHistory.map((payment) => ({
        id: payment.id,
        amountCents: payment.amountCents,
        status: payment.status,
        method: payment.method,
        paidAt: payment.paidAt?.toISOString() ?? null,
        createdAt: payment.createdAt.toISOString(),
      })),
    };
  }

  // ── Escrita ──────────────────────────────────────────────────────────────

  async subscribe(
    tenantId: string,
    clientId: string,
    dto: SubscribeDto,
    request: RequestContext,
  ): Promise<ClientSubscriptionDetail> {
    await this.assertFeatureEnabled(tenantId);

    const existing = await this.prisma.clientSubscription.findFirst({
      where: { tenantId, clientId, status: { not: SubscriptionStatus.CANCELED } },
      select: { id: true },
    });
    if (existing) {
      throw ApiException.conflict('Você já tem uma assinatura nesta barbearia.');
    }

    const plan = await this.prisma.clientPlan.findFirst({
      where: { id: dto.planId, tenantId, active: true, deletedAt: null },
      include: { items: true },
    });
    if (!plan || plan.items.length === 0) {
      throw ApiException.notFound('Plano não encontrado.');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { name: true, phone: true, email: true },
    });
    if (!client) {
      throw ApiException.unauthenticated();
    }

    // Cobrança simulada — fora da transação porque é chamada a um "serviço
    // externo" (o driver mock, que só escreve no Redis). A carga que importa
    // para a integridade do domínio é a que segue, dentro da transação.
    const charge = await this.payments.createSubscription({
      tenantId,
      referenceId: `pending:${clientId}:${plan.id}`,
      amountCents: plan.priceCents,
      billingType: dto.paymentMethod,
      description: `Assinatura ${plan.name}`,
      billingDay: plan.billingDay,
      cycle: 'MONTHLY',
      customer: { name: client.name, phone: client.phone, email: client.email },
    });

    // Mock aprova na hora — não há operadora de verdade do outro lado, e o
    // critério de aceite pede saldo utilizável IMEDIATAMENTE após assinar
    // (agendar um serviço coberto no mesmo fluxo). A aprovação/recusa manual
    // do SPEC (`stack.md` → Adapters) é para a fila de cobranças recorrentes
    // do super admin (fase 08+), não para a primeira contratação.
    await this.payments.simulateTransition(charge.externalId, 'CONFIRMED');
    await this.payments.simulateTransition(charge.externalId, 'RECEIVED');

    const now = new Date();
    const currentPeriodEnd = charge.dueDate ?? addMonths(now, 1);

    const created = await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.clientSubscription.create({
        data: {
          tenantId,
          clientId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd,
          nextChargeAt: currentPeriodEnd,
          externalId: charge.externalId,
          usages: {
            create: plan.items.map((item) => ({
              tenantId,
              serviceId: item.serviceId,
              periodStart: now,
              periodEnd: currentPeriodEnd,
              quota: item.quota,
              used: 0,
            })),
          },
        },
        include: {
          plan: { select: { name: true, priceCents: true } },
          usages: { include: { service: { select: { name: true } } } },
        },
      });

      await tx.payment.create({
        data: {
          tenantId,
          clientSubscriptionId: subscription.id,
          method: dto.paymentMethod === 'PIX' ? PaymentMethod.PIX : PaymentMethod.CREDIT,
          status: PaymentStatus.PAID,
          amountCents: plan.priceCents,
          paidAt: now,
          externalId: charge.externalId,
          // Nunca o número/CVV inteiros — só os 4 últimos dígitos, de exibição.
          metadata: dto.card ? { last4: last4Of(dto.card.number) } : {},
        },
      });

      return subscription;
    });

    await this.audit.record(
      {
        action: AuditAction.SUBSCRIPTION_CREATED,
        entity: 'ClientSubscription',
        entityId: created.id,
        tenantId,
        actorClientId: clientId,
        metadata: { planId: plan.id, paymentMethod: dto.paymentMethod },
      },
      request,
    );

    return this.toDetail(created);
  }

  async pause(tenantId: string, clientId: string, request: RequestContext): Promise<ClientSubscriptionDetail> {
    const subscription = await this.loadActive(tenantId, clientId);
    if (subscription.status === SubscriptionStatus.PAUSED) {
      throw ApiException.conflict('A assinatura já está pausada.');
    }

    const updated = await this.updateStatus(subscription.id, SubscriptionStatus.PAUSED);

    await this.audit.record(
      {
        action: AuditAction.SUBSCRIPTION_PAUSED,
        entity: 'ClientSubscription',
        entityId: subscription.id,
        tenantId,
        actorClientId: clientId,
      },
      request,
    );

    return this.toDetail(updated);
  }

  /**
   * Reativa. Se o ciclo pausado já teria vencido (`currentPeriodEnd` no
   * passado), reativar dispara um ciclo novo de verdade — cobrança e saldo do
   * zero —, porque devolver os usos de um período que nunca foi pago seria dar
   * corte de graça. Se ainda está dentro do ciclo, só destrava.
   */
  async resume(tenantId: string, clientId: string, request: RequestContext): Promise<ClientSubscriptionDetail> {
    const subscription = await this.loadPaused(tenantId, clientId);

    const updated =
      subscription.currentPeriodEnd.getTime() <= Date.now()
        ? await this.renewCycle(subscription.id)
        : await this.updateStatus(subscription.id, SubscriptionStatus.ACTIVE);

    await this.audit.record(
      {
        action: AuditAction.SUBSCRIPTION_RESUMED,
        entity: 'ClientSubscription',
        entityId: subscription.id,
        tenantId,
        actorClientId: clientId,
      },
      request,
    );

    return this.toDetail(updated);
  }

  /** "Perde os usos restantes do ciclo, sem multa" — sem estorno, sem cobrança. */
  async cancel(tenantId: string, clientId: string, request: RequestContext): Promise<ClientSubscriptionDetail> {
    const subscription = await this.loadActive(tenantId, clientId, [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PAST_DUE,
      SubscriptionStatus.PAUSED,
    ]);

    const updated = await this.prisma.clientSubscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date(), nextChargeAt: null },
      include: {
        plan: { select: { name: true, priceCents: true } },
        usages: { include: { service: { select: { name: true } } } },
      },
    });

    await this.audit.record(
      {
        action: AuditAction.SUBSCRIPTION_CANCELED,
        entity: 'ClientSubscription',
        entityId: subscription.id,
        tenantId,
        actorClientId: clientId,
      },
      request,
    );

    return this.toDetail(updated);
  }

  // ── Renovação de ciclo (chamado pelo job da fase 09 e por `resume`) ───────

  /**
   * Cobra a próxima parcela e abre um período novo, com saldo zerado. Pública
   * (não `private`) porque `SubscriptionRenewalService` a chama por assinatura
   * vencida — a MESMA lógica de um ciclo, seja ela disparada pelo relógio ou
   * por quem reativa uma assinatura pausada com o período já vencido.
   */
  async renewCycle(subscriptionId: string) {
    const subscription = await this.prisma.clientSubscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: { plan: { include: { items: true } } },
    });

    const client = await this.prisma.client.findFirst({
      where: { id: subscription.clientId },
      select: { name: true, phone: true, email: true },
    });

    const charge = await this.payments.createSubscription({
      tenantId: subscription.tenantId,
      referenceId: subscription.id,
      amountCents: subscription.plan.priceCents,
      billingType: 'CREDIT_CARD',
      description: `Renovação — ${subscription.plan.name}`,
      billingDay: subscription.plan.billingDay,
      cycle: 'MONTHLY',
      customer: {
        name: client?.name ?? 'Cliente',
        phone: client?.phone ?? '',
        email: client?.email ?? null,
      },
    });
    await this.payments.simulateTransition(charge.externalId, 'CONFIRMED');
    await this.payments.simulateTransition(charge.externalId, 'RECEIVED');

    const now = new Date();
    const currentPeriodEnd = charge.dueDate ?? addMonths(now, 1);

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          tenantId: subscription.tenantId,
          clientSubscriptionId: subscription.id,
          method: PaymentMethod.CREDIT,
          status: PaymentStatus.PAID,
          amountCents: subscription.plan.priceCents,
          paidAt: now,
          externalId: charge.externalId,
        },
      });

      return tx.clientSubscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd,
          nextChargeAt: currentPeriodEnd,
          usages: {
            create: subscription.plan.items.map((item) => ({
              tenantId: subscription.tenantId,
              serviceId: item.serviceId,
              periodStart: now,
              periodEnd: currentPeriodEnd,
              quota: item.quota,
              used: 0,
            })),
          },
        },
        include: {
          plan: { select: { name: true, priceCents: true } },
          usages: { include: { service: { select: { name: true } } } },
        },
      });
    });
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  private async loadActive(
    tenantId: string,
    clientId: string,
    statuses: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
  ) {
    const subscription = await this.prisma.clientSubscription.findFirst({
      where: { tenantId, clientId, status: { in: statuses } },
      orderBy: { startedAt: 'desc' },
    });
    if (!subscription) {
      throw ApiException.notFound('Você não tem assinatura ativa nesta barbearia.');
    }
    return subscription;
  }

  private async loadPaused(tenantId: string, clientId: string) {
    const subscription = await this.prisma.clientSubscription.findFirst({
      where: { tenantId, clientId, status: SubscriptionStatus.PAUSED },
      orderBy: { startedAt: 'desc' },
    });
    if (!subscription) {
      throw ApiException.notFound('Você não tem assinatura pausada nesta barbearia.');
    }
    return subscription;
  }

  private async updateStatus(subscriptionId: string, status: SubscriptionStatus) {
    return this.prisma.clientSubscription.update({
      where: { id: subscriptionId },
      data: { status },
      include: {
        plan: { select: { name: true, priceCents: true } },
        usages: { include: { service: { select: { name: true } } } },
      },
    });
  }

  private toDetail(subscription: SubscriptionWithPlanAndUsages): ClientSubscriptionDetail {
    return {
      id: subscription.id,
      planId: subscription.planId,
      planName: subscription.plan.name,
      priceCents: subscription.plan.priceCents,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      nextChargeAt: subscription.nextChargeAt?.toISOString() ?? null,
      usages: subscription.usages.map((usage) => ({
        serviceId: usage.serviceId,
        serviceName: usage.service.name,
        quota: usage.quota,
        used: usage.used,
      })),
    };
  }

  private async featureEnabled(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { plan: { select: { features: true } } },
    });
    return hasFeature(tenant?.plan?.features, 'fidelidadeAssinaturas');
  }

  private async assertFeatureEnabled(tenantId: string): Promise<void> {
    if (!(await this.featureEnabled(tenantId))) {
      throw ApiException.featureNotInPlan('fidelidadeAssinaturas');
    }
  }
}

// ── Tipos e helpers do módulo ────────────────────────────────────────────────

type SubscriptionWithPlanAndUsages = Awaited<
  ReturnType<ClientSubscriptionService['updateStatus']>
>;

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Só os 4 últimos dígitos — o que sobrevive à borda do servidor. */
function last4Of(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  return digits.slice(-4);
}
