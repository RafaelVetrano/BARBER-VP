import { Inject, Injectable } from '@nestjs/common';
import { SaasInvoiceStatus, SubscriptionStatus, TenantStatus } from '@prisma/client';
import type {
  AdminInvoiceItem,
  AdminInvoiceListQuery,
  AdminInvoiceListResponse,
  RunBillingCycleResult,
} from '@barbervp/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiException } from '../../common/errors/api.exception';
import { AuditAction, AuditService } from '../../audit/audit.service';
import type { RequestContext } from '../../common/types/request-context';
import { pageWindow, toPaginated } from '../../common/dto/pagination.dto';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PAYMENT_ADAPTER, type PaymentAdapter } from '../../adapters/payment/payment.adapter';

/**
 * Billing das barbearias — ciclo simulado via `PAYMENT_ADAPTER` mock.
 *
 * `runCycle()` roda por dois caminhos: o botão "Rodar ciclo" do super admin
 * (com ator e requisição) e o job diário da fila (fase 09), que não tem
 * nenhum dos dois — daí os parâmetros opcionais. O `AuditLog` sai com
 * `actorUserId: null` quando quem rodou foi o relógio, o que é justamente
 * como se distingue uma cobrança automática de uma disparada à mão.
 */
@Injectable()
export class AdminBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_ADAPTER) private readonly payments: PaymentAdapter,
  ) {}

  async listInvoices(query: AdminInvoiceListQuery): Promise<AdminInvoiceListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const where = query.status ? { status: query.status as SaasInvoiceStatus } : {};

    const [rows, total] = await Promise.all([
      this.prisma.saasInvoice.findMany({
        where,
        include: { tenant: { select: { name: true } }, subscription: { select: { plan: { select: { name: true } } } } },
        orderBy: { issuedAt: 'desc' },
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.saasInvoice.count({ where }),
    ]);

    const items: AdminInvoiceItem[] = rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenant.name,
      planName: row.subscription.plan.name,
      amountCents: row.amountCents,
      status: row.status,
      issuedAt: row.issuedAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
    }));

    return toPaginated(items, total, window);
  }

  /** Gera uma fatura PENDING (via `PAYMENT_ADAPTER`) para todo tenant cujo ciclo venceu. */
  async runCycle(
    actorUserId: string | null = null,
    request?: RequestContext,
  ): Promise<RunBillingCycleResult> {
    const due = await this.prisma.tenantSubscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: { lte: new Date() } },
      include: { tenant: true, plan: true },
    });

    let charged = 0;
    for (const subscription of due) {
      const charge = await this.payments.createSubscription({
        tenantId: subscription.tenantId,
        referenceId: subscription.id,
        amountCents: subscription.plan.priceCents,
        billingType: 'PIX',
        description: `Assinatura BarberVP — ${subscription.plan.name}`,
        billingDay: 5,
        cycle: 'MONTHLY',
        customer: {
          name: subscription.tenant.name,
          phone: subscription.tenant.phone ?? '00000000000',
          email: subscription.tenant.email,
          document: subscription.tenant.document,
        },
      });

      await this.prisma.saasInvoice.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          amountCents: subscription.plan.priceCents,
          status: SaasInvoiceStatus.PENDING,
          externalId: charge.externalId,
        },
      });
      charged += 1;
    }

    await this.audit.record(
      {
        action: AuditAction.ADMIN_BILLING_CYCLE_RUN,
        entity: 'TenantSubscription',
        actorUserId,
        metadata: { charged, trigger: actorUserId ? 'admin' : 'schedule' },
      },
      request,
    );

    return { charged, failed: 0, suspended: 0 };
  }

  async approveInvoice(id: string, actorUserId: string, request: RequestContext): Promise<void> {
    const invoice = await this.loadInvoice(id);

    if (invoice.externalId) {
      // O driver mock recusa saltos diretos (é o MESMO gateway simulado que a
      // assinatura do cliente usa, fase 05) — PENDING só vai a CONFIRMED, e só
      // de CONFIRMED chega a RECEIVED.
      await this.payments.simulateTransition(invoice.externalId, 'CONFIRMED');
      await this.payments.simulateTransition(invoice.externalId, 'RECEIVED');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.saasInvoice.update({ where: { id }, data: { status: SaasInvoiceStatus.PAID, paidAt: now } });
      // Aprovado: zera as recusas seguidas e avança o ciclo mais um mês.
      await tx.tenantSubscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          failedAttempts: 0,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
        },
      });
    });

    await this.audit.record(
      { action: AuditAction.ADMIN_INVOICE_APPROVED, entity: 'SaasInvoice', entityId: id, tenantId: invoice.tenantId, actorUserId },
      request,
    );
  }

  /**
   * Recusa manual — o teste de inadimplência que o enunciado pede. Cada
   * recusa incrementa `failedAttempts`; ao bater `BILLING_MAX_FAILED_ATTEMPTS`
   * (env, padrão 3), o tenant é suspenso automaticamente, sem passar pelo
   * super admin de novo.
   */
  async rejectInvoice(id: string, actorUserId: string, request: RequestContext): Promise<{ suspended: boolean }> {
    const invoice = await this.loadInvoice(id);

    if (invoice.externalId) {
      await this.payments.simulateTransition(invoice.externalId, 'FAILED');
    }

    const suspended = await this.prisma.$transaction(async (tx) => {
      await tx.saasInvoice.update({ where: { id }, data: { status: SaasInvoiceStatus.FAILED } });

      const subscription = await tx.tenantSubscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: SubscriptionStatus.PAST_DUE, failedAttempts: { increment: 1 } },
      });

      if (subscription.failedAttempts >= this.config.billing.maxFailedAttempts) {
        await tx.tenant.update({ where: { id: invoice.tenantId }, data: { status: TenantStatus.SUSPENDED } });
        return true;
      }
      return false;
    });

    await this.audit.record(
      {
        action: AuditAction.ADMIN_INVOICE_REJECTED,
        entity: 'SaasInvoice',
        entityId: id,
        tenantId: invoice.tenantId,
        actorUserId,
        metadata: { suspended },
      },
      request,
    );

    return { suspended };
  }

  private async loadInvoice(id: string) {
    const invoice = await this.prisma.saasInvoice.findUnique({
      where: { id },
      select: { id: true, tenantId: true, subscriptionId: true, externalId: true, status: true },
    });
    if (!invoice) {
      throw ApiException.notFound('Fatura não encontrada.');
    }
    if (invoice.status !== SaasInvoiceStatus.PENDING) {
      throw ApiException.conflict('Esta fatura já foi decidida.', 'INVOICE_ALREADY_DECIDED');
    }
    return invoice;
  }
}
