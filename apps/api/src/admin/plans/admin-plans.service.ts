import { Injectable } from '@nestjs/common';
import { FEATURE_KEYS, type AdminPlanItem, type UpsertAdminPlanDto as UpsertPlanContract } from '@barbervp/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiException } from '../../common/errors/api.exception';
import { AuditAction, AuditService } from '../../audit/audit.service';
import type { RequestContext } from '../../common/types/request-context';
import { PlanLimitsService } from '../../team/plan-limits.service';

@Injectable()
export class AdminPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async list(): Promise<AdminPlanItem[]> {
    const plans = await this.prisma.saasPlan.findMany({
      include: { _count: { select: { tenants: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return plans.map(toItem);
  }

  async upsert(
    id: string | undefined,
    dto: UpsertPlanContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<AdminPlanItem> {
    // Nunca inventar feature nova aqui — só as 10 chaves reais de `SPEC.md` →
    // Feature flags (`FEATURE_KEYS`, `@barbervp/types`). Um plano com uma
    // chave estranha nunca vai casar com nenhum `@RequireFeature()` do resto
    // da API, então é melhor recusar na criação do que deixar um botão morto.
    const unknown = Object.keys(dto.features).filter((key) => !FEATURE_KEYS.includes(key as never));
    if (unknown.length > 0) {
      throw ApiException.badRequest(`Feature(s) desconhecida(s): ${unknown.join(', ')}`);
    }
    const features = Object.fromEntries(FEATURE_KEYS.map((key) => [key, dto.features[key] === true]));

    // Guardado ANTES do update: é a comparação que decide se vale reprocessar
    // os tenants do plano (ver abaixo).
    let previousMaxBarbers: number | null = null;

    if (id) {
      const existing = await this.prisma.saasPlan.findUnique({
        where: { id },
        select: { id: true, maxBarbers: true },
      });
      if (!existing) {
        throw ApiException.notFound('Plano não encontrado.');
      }
      previousMaxBarbers = existing.maxBarbers;
    } else {
      const codeTaken = await this.prisma.saasPlan.findUnique({ where: { code: dto.code }, select: { id: true } });
      if (codeTaken) {
        throw ApiException.conflict('Já existe um plano com este código.');
      }
    }

    const saved = id
      ? await this.prisma.saasPlan.update({
          where: { id },
          data: {
            name: dto.name,
            priceCents: dto.priceCents,
            tier: dto.tier,
            maxBarbers: dto.maxBarbers ?? null,
            features,
            isPopular: dto.isPopular ?? false,
            sortOrder: dto.sortOrder ?? 0,
          },
          include: { _count: { select: { tenants: true } } },
        })
      : await this.prisma.saasPlan.create({
          data: {
            code: dto.code,
            name: dto.name,
            priceCents: dto.priceCents,
            tier: dto.tier,
            maxBarbers: dto.maxBarbers ?? null,
            features,
            isPopular: dto.isPopular ?? false,
            sortOrder: dto.sortOrder ?? 0,
          },
          include: { _count: { select: { tenants: true } } },
        });

    /*
     * O TETO MUDOU: reprocessa quem já está no plano.
     *
     * `applyPlanLimit` só rodava na troca de plano DO TENANT
     * (`/settings/plan/change` e `/admin/tenants/:id/plan`). Editar
     * `maxBarbers` do PLANO aqui deixava todos os tenants dele com a marcação
     * velha até a próxima troca: um plano que encolhe seguia com barbeiros
     * acima do novo teto ativos na agenda, e um plano que cresce não devolvia
     * as vagas que ele mesmo acabara de comprar.
     *
     * Só quando o teto de fato mudou, e só para os tenants daquele plano — a
     * varredura é uma transação por tenant, e não uma transação gigante, para
     * que o erro num tenant não desfaça o conserto dos outros.
     */
    if (id && previousMaxBarbers !== saved.maxBarbers) {
      const tenants = await this.prisma.tenant.findMany({
        where: { planId: saved.id, deletedAt: null },
        select: { id: true },
      });

      for (const tenant of tenants) {
        await this.prisma.$transaction((tx) =>
          this.planLimits.applyPlanLimit(tx, tenant.id, saved.maxBarbers),
        );
      }

      await this.audit.record(
        {
          action: AuditAction.ADMIN_PLAN_LIMIT_REAPPLIED,
          entity: 'SaasPlan',
          entityId: saved.id,
          actorUserId,
          metadata: {
            from: previousMaxBarbers,
            to: saved.maxBarbers,
            tenantsReprocessed: tenants.length,
          },
        },
        request,
      );
    }

    await this.audit.record(
      { action: AuditAction.ADMIN_PLAN_UPSERTED, entity: 'SaasPlan', entityId: saved.id, actorUserId, metadata: { code: saved.code } },
      request,
    );

    return toItem(saved);
  }

  async archive(id: string, actorUserId: string, request: RequestContext): Promise<void> {
    const existing = await this.prisma.saasPlan.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw ApiException.notFound('Plano não encontrado.');
    }
    await this.prisma.saasPlan.update({ where: { id }, data: { active: false } });
    await this.audit.record(
      { action: AuditAction.ADMIN_PLAN_ARCHIVED, entity: 'SaasPlan', entityId: id, actorUserId },
      request,
    );
  }
}

function toItem(plan: {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  tier: number;
  maxBarbers: number | null;
  features: unknown;
  isPopular: boolean;
  active: boolean;
  sortOrder: number;
  _count: { tenants: number };
}): AdminPlanItem {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    priceCents: plan.priceCents,
    tier: plan.tier,
    maxBarbers: plan.maxBarbers,
    features: (typeof plan.features === 'object' && plan.features !== null ? plan.features : {}) as never,
    isPopular: plan.isPopular,
    active: plan.active,
    sortOrder: plan.sortOrder,
    tenantCount: plan._count.tenants,
  };
}
