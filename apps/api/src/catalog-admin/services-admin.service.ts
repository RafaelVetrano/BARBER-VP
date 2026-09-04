import { Injectable } from '@nestjs/common';
import { AppointmentStatus, CommissionRuleType, Prisma } from '@prisma/client';
import type { ServiceListItem, ServiceListResponse } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { pageWindow, toPaginated } from '../common/dto/pagination.dto';
import type { RequestContext } from '../common/types/request-context';
import type { ServiceListQueryDto, UpsertServiceDto } from './dto/catalog-admin.dto';

const SERVICE_INCLUDE = {
  barberServices: { select: { barberId: true } },
} satisfies Prisma.ServiceInclude;

type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof SERVICE_INCLUDE }>;

/**
 * CRUD de `Service` para o dono/gerente (tela "Serviços & Produtos").
 *
 * O catálogo é o MESMO que o motor de disponibilidade (fase 04) e o wizard
 * público leem — criar/editar aqui muda o que aparece no booking na mesma
 * hora, sem sincronização à parte.
 */
@Injectable()
export class ServicesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, query: ServiceListQueryDto): Promise<ServiceListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const defaultCommissionBps = await this.defaultCommissionBps(tenantId);
    const where: Prisma.ServiceWhereInput = { tenantId, deletedAt: null };

    if (query.category) {
      where.category = query.category;
    }
    if (query.active !== undefined) {
      where.active = query.active === 'true';
    }
    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [rows, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        include: SERVICE_INCLUDE,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.service.count({ where }),
    ]);

    return {
      ...toPaginated(
        rows.map((row) => toListItem(row, defaultCommissionBps)),
        total,
        window,
      ),
      defaultCommissionBps,
    };
  }

  /**
   * A comissão que um serviço herda quando não tem override: o `percentBps` da
   * regra FIXED padrão da barbearia.
   *
   * Regra por FAIXAS não tem um percentual único — ele depende do faturamento
   * acumulado do barbeiro no mês, que a tela do catálogo não conhece. Nesse
   * caso a herança é 0 aqui e o cálculo real segue com a faixa no fechamento
   * da comanda; a coluna mostra a faixa mais baixa como piso honesto.
   */
  private async defaultCommissionBps(tenantId: string): Promise<number> {
    const rule = await this.prisma.commissionRule.findFirst({
      where: { tenantId, active: true },
      orderBy: { createdAt: 'asc' },
      select: {
        type: true,
        percentBps: true,
        tiers: { select: { percentBps: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });
    if (!rule) return 0;
    return rule.type === CommissionRuleType.FIXED
      ? (rule.percentBps ?? 0)
      : (rule.tiers[0]?.percentBps ?? 0);
  }

  async create(
    tenantId: string,
    dto: UpsertServiceDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ServiceListItem> {
    await this.assertBarbersBelongToTenant(tenantId, dto.barberIds);

    const count = await this.prisma.service.count({ where: { tenantId, deletedAt: null } });

    const created = await this.runGuardingUniqueName(() =>
      this.prisma.service.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          description: dto.description ?? null,
          durationMin: dto.durationMin,
          priceCents: dto.priceCents,
          category: dto.category ?? null,
          color: dto.color ?? null,
          commissionBps: dto.commissionBps ?? null,
          active: dto.active ?? true,
          sortOrder: count,
          barberServices: dto.barberIds
            ? { create: dto.barberIds.map((barberId) => ({ tenantId, barberId })) }
            : undefined,
        },
        include: SERVICE_INCLUDE,
      }),
    );

    await this.audit.record(
      {
        action: AuditAction.SERVICE_CREATED,
        entity: 'Service',
        entityId: created.id,
        tenantId,
        actorUserId,
        metadata: { name: created.name },
      },
      request,
    );

    return toListItem(created, await this.defaultCommissionBps(tenantId));
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpsertServiceDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ServiceListItem> {
    await this.loadOwned(tenantId, id);
    await this.assertBarbersBelongToTenant(tenantId, dto.barberIds);

    const updated = await this.runGuardingUniqueName(() =>
      this.prisma.$transaction(async (tx) => {
        if (dto.barberIds) {
          await tx.barberService.deleteMany({ where: { tenantId, serviceId: id } });
          if (dto.barberIds.length > 0) {
            await tx.barberService.createMany({
              data: dto.barberIds.map((barberId) => ({ tenantId, barberId, serviceId: id })),
              skipDuplicates: true,
            });
          }
        }

        return tx.service.update({
          where: { id },
          data: {
            name: dto.name.trim(),
            description: dto.description ?? null,
            durationMin: dto.durationMin,
            priceCents: dto.priceCents,
            category: dto.category ?? null,
            color: dto.color ?? null,
            commissionBps: dto.commissionBps ?? null,
            active: dto.active ?? true,
          },
          include: SERVICE_INCLUDE,
        });
      }),
    );

    await this.audit.record(
      {
        action: AuditAction.SERVICE_UPDATED,
        entity: 'Service',
        entityId: updated.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return toListItem(updated, await this.defaultCommissionBps(tenantId));
  }

  async setActive(
    tenantId: string,
    id: string,
    active: boolean,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ServiceListItem> {
    await this.loadOwned(tenantId, id);

    const updated = await this.prisma.service.update({
      where: { id },
      data: { active },
      include: SERVICE_INCLUDE,
    });

    await this.audit.record(
      {
        action: AuditAction.SERVICE_ARCHIVED,
        entity: 'Service',
        entityId: updated.id,
        tenantId,
        actorUserId,
        metadata: { active },
      },
      request,
    );

    return toListItem(updated, await this.defaultCommissionBps(tenantId));
  }

  /**
   * "Excluir" do kebab (protótipo l.1770) — **soft-delete**.
   *
   * Nunca `DELETE` de verdade: `Appointment`, `OrderItem` e `ClientPlanItem`
   * apontam para o serviço, e um histórico com o nome do serviço apagado é um
   * relatório mentiroso. O `deletedAt` tira o serviço do catálogo, do booking
   * e da agenda; o passado continua legível.
   *
   * O nome sai junto do índice `@@unique([tenantId, name])` — senão o dono não
   * conseguiria recadastrar "Corte Masculino" depois de excluí-lo. O nome
   * antigo fica preservado no `AuditLog` e nas comandas fechadas.
   */
  async remove(
    tenantId: string,
    id: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<void> {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!service) {
      throw ApiException.notFound('Serviço não encontrado.');
    }

    const upcoming = await this.prisma.appointment.count({
      where: {
        tenantId,
        serviceId: id,
        startsAt: { gte: new Date() },
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
      },
    });
    if (upcoming > 0) {
      throw ApiException.conflict(
        `Este serviço tem ${upcoming} agendamento(s) futuro(s). Cancele ou remarque antes de excluir — ou desative o serviço para tirá-lo do site sem mexer na agenda.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.barberService.deleteMany({ where: { tenantId, serviceId: id } });
      await tx.service.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          active: false,
          name: `${service.name} (excluído ${Date.now()})`,
        },
      });
    });

    await this.audit.record(
      {
        action: AuditAction.SERVICE_DELETED,
        entity: 'Service',
        entityId: id,
        tenantId,
        actorUserId,
        metadata: { name: service.name },
      },
      request,
    );
  }

  private async loadOwned(tenantId: string, id: string): Promise<void> {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!service) {
      throw ApiException.notFound('Serviço não encontrado.');
    }
  }

  private async assertBarbersBelongToTenant(tenantId: string, barberIds?: string[]): Promise<void> {
    if (!barberIds || barberIds.length === 0) {
      return;
    }
    const count = await this.prisma.barber.count({
      where: { id: { in: barberIds }, tenantId, deletedAt: null },
    });
    if (count !== barberIds.length) {
      throw ApiException.badRequest('Um dos barbeiros selecionados não pertence a esta barbearia.');
    }
  }

  private async runGuardingUniqueName<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw ApiException.conflict('Já existe um serviço com este nome.');
      }
      throw error;
    }
  }
}

function toListItem(row: ServiceRow, defaultCommissionBps: number): ServiceListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    durationMin: row.durationMin,
    priceCents: row.priceCents,
    category: row.category,
    color: row.color,
    commissionBps: row.commissionBps,
    effectiveCommissionBps: row.commissionBps ?? defaultCommissionBps,
    isCombo: row.isCombo,
    active: row.active,
    sortOrder: row.sortOrder,
    barberIds: row.barberServices.map((link) => link.barberId),
  };
}
