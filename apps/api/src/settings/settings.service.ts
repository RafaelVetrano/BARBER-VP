import { Injectable } from '@nestjs/common';
import { SaasInvoiceStatus } from '@prisma/client';
import type {
  BarbershopSettings,
  ChangePlanDto as ChangePlanContract,
  CurrentPlanResponse,
  PreferencesSettings,
  PriceCalculatorDto as PriceCalculatorContract,
  PriceCalculatorResult,
  SaasPlanOption,
  UnitItem,
  UpdateBarbershopSettingsDto as UpdateBarbershopSettingsContract,
  UpdatePreferencesDto as UpdatePreferencesContract,
  UpsertUnitDto as UpsertUnitContract,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
      })),
    };
  }

  async updateBarbershop(
    tenantId: string,
    dto: UpdateBarbershopSettingsContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<BarbershopSettings> {
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
          await tx.tenantBusinessHour.upsert({
            where: { tenantId_weekday: { tenantId, weekday: hour.weekday } },
            create: { tenantId, ...hour },
            update: { opensAt: hour.opensAt, closesAt: hour.closesAt, closed: hour.closed },
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
    return units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      address: unit.address,
      phone: unit.phone,
      isDefault: unit.isDefault,
      active: unit.active,
      barberCount: unit._count.barbers,
    }));
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

    return { id: unit.id, name: unit.name, address: unit.address, phone: unit.phone, isDefault: unit.isDefault, active: unit.active, barberCount: 0 };
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

    return {
      id: unit.id,
      name: unit.name,
      address: unit.address,
      phone: unit.phone,
      isDefault: unit.isDefault,
      active: unit.active,
      barberCount: unit._count.barbers,
    };
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

    return {
      plan: toPlanOption(tenant.plan),
      renewsAt: subscription?.currentPeriodEnd.toISOString() ?? new Date().toISOString(),
      status: subscription?.status ?? 'ACTIVE',
      invoices: (subscription?.invoices ?? []).map((invoice) => ({
        id: invoice.id,
        amountCents: invoice.amountCents,
        status: invoice.status,
        issuedAt: invoice.issuedAt.toISOString(),
        paidAt: invoice.paidAt?.toISOString() ?? null,
      })),
      availablePlans: availablePlans.map(toPlanOption),
      barbersInUse,
    };
  }

  async changePlan(
    tenantId: string,
    dto: ChangePlanContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<CurrentPlanResponse> {
    const [newPlan, barbersInUse, subscription] = await Promise.all([
      this.prisma.saasPlan.findFirst({ where: { id: dto.planId, active: true } }),
      this.prisma.barber.count({ where: { tenantId, active: true } }),
      this.prisma.tenantSubscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    ]);

    if (!newPlan) {
      throw ApiException.notFound('Plano não encontrado.');
    }
    if (newPlan.maxBarbers !== null && barbersInUse > newPlan.maxBarbers) {
      throw ApiException.badRequest(
        `O plano ${newPlan.name} permite até ${newPlan.maxBarbers} barbeiro(s), e esta barbearia tem ${barbersInUse} ativo(s). Desative barbeiros antes de fazer o downgrade.`,
      );
    }

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { planId: newPlan.id } });

      const activeSubscription = subscription
        ? await tx.tenantSubscription.update({
            where: { id: subscription.id },
            data: { planId: newPlan.id, currentPeriodStart: now, currentPeriodEnd: periodEnd },
          })
        : await tx.tenantSubscription.create({
            data: { tenantId, planId: newPlan.id, currentPeriodStart: now, currentPeriodEnd: periodEnd },
          });

      // Driver mock — aprova a cobrança da troca na hora (mesmo padrão da fase 05).
      await tx.saasInvoice.create({
        data: {
          tenantId,
          subscriptionId: activeSubscription.id,
          amountCents: newPlan.priceCents,
          status: SaasInvoiceStatus.PAID,
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
        metadata: { planId: newPlan.id, planCode: newPlan.code },
      },
      request,
    );

    return this.currentPlan(tenantId);
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

  // ── Calculadora de preço inteligente (Avançado) ─────────────────────────

  priceCalculator(dto: PriceCalculatorContract): PriceCalculatorResult {
    const custoFixoPorAtendimento = Math.round(dto.custosFixosCents / dto.atendimentosMes);
    const custoVariavelPorAtendimentoCents = dto.custoCents + custoFixoPorAtendimento;

    // Preço que cobre custo + margem desejada, já contando a comissão do
    // barbeiro sobre o preço final (a mesma dedução que a comanda faz).
    const denominator = 1 - dto.margemPercent / 100 - dto.comissaoPercent / 100;
    const precoSugeridoCents =
      denominator > 0
        ? Math.round(custoVariavelPorAtendimentoCents / denominator)
        : custoVariavelPorAtendimentoCents;

    return { custoVariavelPorAtendimentoCents, precoSugeridoCents };
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
  };
}
