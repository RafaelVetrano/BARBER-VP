import { Inject, Injectable } from '@nestjs/common';
import { MembershipRole, SaasInvoiceStatus, SubscriptionStatus } from '@prisma/client';
import type {
  BarbershopSettings,
  ChangePlanDto as ChangePlanContract,
  CurrentPlanResponse,
  FeatureKey,
  PlanChangePreview,
  PreferencesSettings,
  SaasPlanOption,
  TenantBusinessHour,
  UnitItem,
  UnitStatus,
  UpdateBarbershopSettingsDto as UpdateBarbershopSettingsContract,
  UpdatePreferencesDto as UpdatePreferencesContract,
  UpsertUnitDto as UpsertUnitContract,
} from '@barbervp/types';
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  WEEKDAY_SHORT_LABELS,
  hasFeature,
  minutesToTime,
  planMarketingFrom,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { PlanLimitsService } from '../team/plan-limits.service';
import { CONFIG, type AppConfig } from '../config/configuration';
import { PAYMENT_ADAPTER, type PaymentAdapter } from '../adapters/payment/payment.adapter';
import { InvoicePdfService, type InvoiceExport } from './invoice-pdf.service';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
    private readonly invoicePdfs: InvoicePdfService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_ADAPTER) private readonly payments: PaymentAdapter,
  ) {}

  // ── Barbearia ────────────────────────────────────────────────────────────

  async barbershop(tenantId: string): Promise<BarbershopSettings> {
    const tenant = await this.prisma.tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: {
        name: true,
        document: true,
        phone: true,
        timezone: true,
        settings: { select: { address: true } },
        businessHours: { orderBy: { weekday: 'asc' } },
      },
    });

    return {
      name: tenant.name,
      document: tenant.document,
      address: tenant.settings?.address ?? null,
      phone: tenant.phone,
      timezone: tenant.timezone,
      businessHours: tenant.businessHours.map((hour) => ({
        weekday: hour.weekday,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        closed: hour.closed,
        lunchStart: hour.lunchStart,
        lunchEnd: hour.lunchEnd,
      })),
    };
  }

  async updateBarbershop(
    tenantId: string,
    dto: UpdateBarbershopSettingsContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<BarbershopSettings> {
    if (dto.businessHours) {
      assertBusinessHours(dto.businessHours);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          name: dto.name,
          document: dto.document,
          phone: dto.phone,
          timezone: dto.timezone,
        },
      });

      if (dto.address !== undefined) {
        await tx.tenantSettings.upsert({
          where: { tenantId },
          update: { address: dto.address },
          create: { tenantId, address: dto.address },
        });
      }

      if (dto.businessHours) {
        for (const hour of dto.businessHours) {
          const data = {
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
            closed: hour.closed,
            lunchStart: hour.lunchStart ?? null,
            lunchEnd: hour.lunchEnd ?? null,
          };
          await tx.tenantBusinessHour.upsert({
            where: { tenantId_weekday: { tenantId, weekday: hour.weekday } },
            create: { tenantId, weekday: hour.weekday, ...data },
            update: data,
          });
        }
      }
    });

    await this.audit.record(
      { action: AuditAction.BARBERSHOP_SETTINGS_UPDATED, entity: 'Tenant', entityId: tenantId, tenantId, actorUserId },
      request,
    );

    return this.barbershop(tenantId);
  }

  // ── Unidades (Avançado) ──────────────────────────────────────────────────

  async listUnits(tenantId: string): Promise<UnitItem[]> {
    const units = await this.prisma.unit.findMany({
      where: { tenantId, deletedAt: null },
      include: { _count: { select: { barbers: { where: { active: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return units.map((unit) => toUnitItem(unit, unit._count.barbers));
  }

  async createUnit(
    tenantId: string,
    dto: UpsertUnitContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<UnitItem> {
    const isFirst = (await this.prisma.unit.count({ where: { tenantId } })) === 0;
    const unit = await this.prisma.unit.create({
      data: {
        tenantId,
        name: dto.name,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        isDefault: isFirst,
      },
    });

    await this.audit.record(
      { action: AuditAction.UNIT_CREATED, entity: 'Unit', entityId: unit.id, tenantId, actorUserId },
      request,
    );

    return toUnitItem(unit, 0);
  }

  async updateUnit(
    tenantId: string,
    id: string,
    dto: UpsertUnitContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<UnitItem> {
    const existing = await this.prisma.unit.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) {
      throw ApiException.notFound('Unidade não encontrada.');
    }
    const unit = await this.prisma.unit.update({
      where: { id },
      data: { name: dto.name, address: dto.address ?? null, phone: dto.phone ?? null },
      include: { _count: { select: { barbers: { where: { active: true } } } } },
    });

    await this.audit.record(
      { action: AuditAction.UNIT_UPDATED, entity: 'Unit', entityId: id, tenantId, actorUserId },
      request,
    );

    return toUnitItem(unit, unit._count.barbers);
  }

  // ── Plano do SaaS ────────────────────────────────────────────────────────

  async currentPlan(tenantId: string): Promise<CurrentPlanResponse> {
    const [tenant, availablePlans, barbersInUse] = await Promise.all([
      this.prisma.tenant.findFirstOrThrow({
        where: { id: tenantId },
        select: {
          plan: true,
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              currentPeriodEnd: true,
              invoices: { orderBy: { issuedAt: 'desc' }, take: 12 },
            },
          },
        },
      }),
      this.prisma.saasPlan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.barber.count({ where: { tenantId, active: true } }),
    ]);

    if (!tenant.plan) {
      throw ApiException.notFound('Este tenant ainda não contratou um plano.');
    }

    const subscription = tenant.subscriptions[0];
    const dueMs = this.config.billing.dueDays * 24 * 60 * 60 * 1_000;
    const now = Date.now();

    return {
      plan: toPlanOption(tenant.plan),
      // Sem assinatura não há renovação — antes esta linha era
      // `new Date().toISOString()`, e a tela anunciava que o plano renovava
      // HOJE para todo tenant sem `TenantSubscription`.
      renewsAt: subscription?.currentPeriodEnd.toISOString() ?? null,
      status: subscription?.status ?? SubscriptionStatus.ACTIVE,
      invoices: (subscription?.invoices ?? []).map((invoice) => ({
        id: invoice.id,
        amountCents: invoice.amountCents,
        status: invoice.status,
        overdue:
          invoice.status === SaasInvoiceStatus.PENDING &&
          now - invoice.issuedAt.getTime() > dueMs,
        issuedAt: invoice.issuedAt.toISOString(),
        paidAt: invoice.paidAt?.toISOString() ?? null,
      })),
      availablePlans: availablePlans.map(toPlanOption),
      barbersInUse,
    };
  }

  /**
   * "Você vai ganhar" / "Você vai perder" do `modalTrocarPlano` (l.3487/3495).
   *
   * O diff é entre os `features` REAIS dos dois planos — o super admin pode
   * ter editado qualquer um deles, e o modal tem de contar a verdade do banco,
   * não a tabela de tiers do desenho. As perdas incluem os barbeiros que o
   * downgrade vai desligar, por NOME: "3 barbeiros ficam inativos" é um aviso;
   * "Rafael, Bruno e Diego ficam inativos" é uma decisão informada.
   */
  async previewPlanChange(tenantId: string, planId: string): Promise<PlanChangePreview> {
    const [tenant, target] = await Promise.all([
      this.prisma.tenant.findFirstOrThrow({
        where: { id: tenantId },
        select: { plan: true },
      }),
      this.prisma.saasPlan.findFirst({ where: { id: planId, active: true } }),
    ]);

    if (!target) {
      throw ApiException.notFound('Plano não encontrado.');
    }
    if (!tenant.plan) {
      throw ApiException.notFound('Este tenant ainda não contratou um plano.');
    }
    if (tenant.plan.id === target.id) {
      throw ApiException.conflict('Este já é o plano da barbearia.', 'PLAN_UNCHANGED');
    }

    const gained: string[] = [];
    const lost: string[] = [];
    for (const key of FEATURE_KEYS) {
      const had = hasFeature(tenant.plan.features, key);
      const has = hasFeature(target.features, key);
      if (!had && has) gained.push(FEATURE_LABELS[key as FeatureKey]);
      if (had && !has) lost.push(FEATURE_LABELS[key as FeatureKey]);
    }

    const barbersToDeactivate = await this.barbersLosingSeat(tenantId, target.maxBarbers);
    if (barbersToDeactivate.length > 0) {
      lost.unshift(
        barbersToDeactivate.length === 1
          ? `${barbersToDeactivate[0]} fica inativo pelo limite de ${target.maxBarbers} barbeiros`
          : `${barbersToDeactivate.length} barbeiros ficam inativos pelo limite de ${target.maxBarbers}: ${barbersToDeactivate.join(', ')}`,
      );
    }

    const seatsGained =
      target.maxBarbers === null && tenant.plan.maxBarbers !== null
        ? 'Barbeiros ilimitados'
        : target.maxBarbers !== null &&
            tenant.plan.maxBarbers !== null &&
            target.maxBarbers > tenant.plan.maxBarbers
          ? `Até ${target.maxBarbers} barbeiros`
          : null;
    if (seatsGained) {
      gained.unshift(seatsGained);
    }

    return {
      planId: target.id,
      planName: target.name,
      priceCents: target.priceCents,
      currentPlanName: tenant.plan.name,
      isDowngrade: target.tier < tenant.plan.tier,
      gained,
      lost,
      barbersToDeactivate,
    };
  }

  /**
   * Quem o downgrade desliga, na MESMA ordem em que `applyPlanLimit` desliga
   * (fim da fila primeiro, dono nunca) — as duas contas precisam bater, senão
   * o modal promete uma coisa e a troca faz outra.
   */
  private async barbersLosingSeat(tenantId: string, maxBarbers: number | null): Promise<string[]> {
    if (maxBarbers === null) {
      return [];
    }
    const [barbers, owners] = await Promise.all([
      this.prisma.barber.findMany({
        where: { tenantId, deletedAt: null, active: true },
        select: { id: true, name: true, userId: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.membership
        .findMany({
          where: { tenantId, role: MembershipRole.OWNER, active: true },
          select: { userId: true },
        })
        .then((rows) => new Set(rows.map((row) => row.userId))),
    ]);

    const keep = new Set<string>();
    for (const barber of barbers) {
      if ((barber.userId !== null && owners.has(barber.userId)) || keep.size < maxBarbers) {
        keep.add(barber.id);
      }
    }
    return barbers.filter((barber) => !keep.has(barber.id)).map((barber) => barber.name);
  }

  async changePlan(
    tenantId: string,
    dto: ChangePlanContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<CurrentPlanResponse> {
    const [tenant, newPlan, subscription] = await Promise.all([
      this.prisma.tenant.findFirstOrThrow({
        where: { id: tenantId },
        select: { name: true, email: true, phone: true, document: true, planId: true },
      }),
      this.prisma.saasPlan.findFirst({ where: { id: dto.planId, active: true } }),
      this.prisma.tenantSubscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    ]);

    if (!newPlan) {
      throw ApiException.notFound('Plano não encontrado.');
    }
    if (tenant.planId === newPlan.id) {
      throw ApiException.conflict('Este já é o plano da barbearia.', 'PLAN_UNCHANGED');
    }

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    // A cobrança da troca passa pelo `PAYMENT_ADAPTER`, como toda cobrança do
    // produto — antes esta rota criava uma `SaasInvoice` PAID direto no banco,
    // e a troca de plano era a única movimentação financeira do SaaS que o
    // gateway nunca via. O driver mock recusa saltos: PENDING → CONFIRMED →
    // RECEIVED, os mesmos dois passos que a aprovação do super admin dá.
    const charge = await this.payments.createCharge({
      tenantId,
      referenceId: subscription?.id ?? tenantId,
      amountCents: newPlan.priceCents,
      billingType: 'PIX',
      description: `Assinatura BarberVP — ${newPlan.name}`,
      customer: {
        name: tenant.name,
        phone: tenant.phone ?? '00000000000',
        email: tenant.email,
        document: tenant.document,
      },
    });
    await this.payments.simulateTransition(charge.externalId, 'CONFIRMED');
    await this.payments.simulateTransition(charge.externalId, 'RECEIVED');

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { planId: newPlan.id } });

      // O downgrade não é RECUSADO (era: "desative barbeiros antes"). Exigir
      // que o dono desmonte a equipe na mão para depois trocar de plano punia
      // justamente quem está cortando custo. Agora a troca acontece e os
      // excedentes ficam "Inativo pelo plano" — visíveis, com banner e com
      // volta automática no upgrade. Protótipo l.2025.
      await this.planLimits.applyPlanLimit(tx, tenantId, newPlan.maxBarbers);

      const activeSubscription = subscription
        ? await tx.tenantSubscription.update({
            where: { id: subscription.id },
            data: {
              planId: newPlan.id,
              status: SubscriptionStatus.ACTIVE,
              failedAttempts: 0,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
          })
        : await tx.tenantSubscription.create({
            data: { tenantId, planId: newPlan.id, currentPeriodStart: now, currentPeriodEnd: periodEnd },
          });

      await tx.saasInvoice.create({
        data: {
          tenantId,
          subscriptionId: activeSubscription.id,
          amountCents: newPlan.priceCents,
          status: SaasInvoiceStatus.PAID,
          externalId: charge.externalId,
          paidAt: now,
        },
      });
    });

    await this.audit.record(
      {
        action: AuditAction.PLAN_CHANGED,
        entity: 'Tenant',
        entityId: tenantId,
        tenantId,
        actorUserId,
        metadata: { planId: newPlan.id, planCode: newPlan.code, externalId: charge.externalId },
      },
      request,
    );

    return this.currentPlan(tenantId);
  }

  /**
   * O link "PDF" de cada linha do histórico de faturas (l.2672).
   *
   * A busca filtra por `tenantId` junto do `id`: o recibo é o documento
   * financeiro de UMA barbearia, e um cuid adivinhado de outra tem de dar 404,
   * não um PDF com o nome do vizinho.
   */
  async invoicePdf(tenantId: string, invoiceId: string): Promise<InvoiceExport> {
    const invoice = await this.prisma.saasInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: {
        id: true,
        amountCents: true,
        status: true,
        issuedAt: true,
        paidAt: true,
        externalId: true,
        subscription: { select: { plan: { select: { name: true } } } },
        tenant: { select: { name: true, document: true } },
      },
    });

    if (!invoice) {
      throw ApiException.notFound('Fatura não encontrada.');
    }

    return this.invoicePdfs.render({
      invoiceId: invoice.id,
      tenantName: invoice.tenant.name,
      tenantDocument: invoice.tenant.document,
      planName: invoice.subscription.plan.name,
      amountCents: invoice.amountCents,
      status: invoice.status,
      overdue:
        invoice.status === SaasInvoiceStatus.PENDING &&
        Date.now() - invoice.issuedAt.getTime() >
          this.config.billing.dueDays * 24 * 60 * 60 * 1_000,
      issuedAt: invoice.issuedAt,
      paidAt: invoice.paidAt,
      externalId: invoice.externalId,
    });
  }

  // ── Preferências ─────────────────────────────────────────────────────────

  async preferences(tenantId: string): Promise<PreferencesSettings> {
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    return {
      bloquearFaltasAtivo: settings?.bloquearFaltasAtivo ?? true,
      bloquearFaltasQtd: settings?.bloquearFaltasQtd ?? 3,
      antecedenciaMinima: settings?.antecedenciaMinima ?? 60,
      cancelamentoHoras: settings?.cancelamentoHoras ?? 2,
      monthlyGoalCents: settings?.monthlyGoalCents ?? null,
    };
  }

  async updatePreferences(
    tenantId: string,
    dto: UpdatePreferencesContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<PreferencesSettings> {
    const settings = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: {
        bloquearFaltasAtivo: dto.bloquearFaltasAtivo,
        bloquearFaltasQtd: dto.bloquearFaltasQtd,
        antecedenciaMinima: dto.antecedenciaMinima,
        cancelamentoHoras: dto.cancelamentoHoras,
        monthlyGoalCents: dto.monthlyGoalCents,
      },
      create: {
        tenantId,
        bloquearFaltasAtivo: dto.bloquearFaltasAtivo ?? true,
        bloquearFaltasQtd: dto.bloquearFaltasQtd ?? 3,
        antecedenciaMinima: dto.antecedenciaMinima ?? 60,
        cancelamentoHoras: dto.cancelamentoHoras ?? 2,
        monthlyGoalCents: dto.monthlyGoalCents ?? null,
      },
    });

    await this.audit.record(
      { action: AuditAction.PREFERENCES_UPDATED, entity: 'TenantSettings', entityId: settings.id, tenantId, actorUserId },
      request,
    );

    return {
      bloquearFaltasAtivo: settings.bloquearFaltasAtivo,
      bloquearFaltasQtd: settings.bloquearFaltasQtd,
      antecedenciaMinima: settings.antecedenciaMinima,
      cancelamentoHoras: settings.cancelamentoHoras,
      monthlyGoalCents: settings.monthlyGoalCents,
    };
  }

}

function toPlanOption(plan: {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  tier: number;
  maxBarbers: number | null;
  isPopular: boolean;
  features: unknown;
  marketing: unknown;
}): SaasPlanOption {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    priceCents: plan.priceCents,
    tier: plan.tier,
    maxBarbers: plan.maxBarbers,
    isPopular: plan.isPopular,
    features: typeof plan.features === 'object' && plan.features !== null
      ? (plan.features as Record<string, boolean>)
      : {},
    // Os bullets do card de comparação. Saem da MESMA coluna que a landing
    // consome (`SaasPlan.marketing`): o dono lê a mesma promessa antes e
    // depois de assinar, e mudá-la é um `UPDATE`, não um deploy.
    marketing: planMarketingFrom(plan.marketing),
  };
}

/**
 * Status da unidade — derivado, nunca gravado. Ver `UnitStatus`.
 */
function unitStatusOf(unit: { active: boolean }, barberCount: number): UnitStatus {
  if (!unit.active) return 'INACTIVE';
  return barberCount === 0 ? 'SETUP' : 'ACTIVE';
}

function toUnitItem(
  unit: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    isDefault: boolean;
    active: boolean;
  },
  barberCount: number,
): UnitItem {
  return {
    id: unit.id,
    name: unit.name,
    address: unit.address,
    phone: unit.phone,
    isDefault: unit.isDefault,
    active: unit.active,
    barberCount,
    status: unitStatusOf(unit, barberCount),
  };
}

/**
 * Recusa um expediente impossível ANTES de gravar.
 *
 * As duas CHECKs da migration já barram o almoço fora da janela, mas um erro
 * de constraint chega ao dono como 500 sem explicação nenhuma. Aqui a recusa
 * é 400 e diz o dia e o motivo.
 */
function assertBusinessHours(hours: TenantBusinessHour[]): void {
  const seen = new Set<number>();
  for (const hour of hours) {
    if (seen.has(hour.weekday)) {
      throw ApiException.badRequest('O mesmo dia da semana veio duas vezes no expediente.');
    }
    seen.add(hour.weekday);

    const day = WEEKDAY_SHORT_LABELS[hour.weekday] ?? String(hour.weekday);
    if (hour.closed) {
      continue;
    }
    if (hour.closesAt <= hour.opensAt) {
      throw ApiException.badRequest(`${day}: o fechamento precisa ser depois da abertura.`);
    }
    const hasStart = hour.lunchStart !== null && hour.lunchStart !== undefined;
    const hasEnd = hour.lunchEnd !== null && hour.lunchEnd !== undefined;
    if (hasStart !== hasEnd) {
      throw ApiException.badRequest(`${day}: informe o início E o fim do almoço.`);
    }
    if (!hasStart) {
      continue;
    }
    const start = hour.lunchStart as number;
    const end = hour.lunchEnd as number;
    if (end <= start) {
      throw ApiException.badRequest(`${day}: o almoço precisa terminar depois de começar.`);
    }
    if (start < hour.opensAt || end > hour.closesAt) {
      throw ApiException.badRequest(
        `${day}: o almoço (${minutesToTime(start)}–${minutesToTime(end)}) está fora do expediente ` +
          `(${minutesToTime(hour.opensAt)}–${minutesToTime(hour.closesAt)}).`,
      );
    }
  }
}
