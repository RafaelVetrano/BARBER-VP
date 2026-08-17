import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    return toPaginated(rows.map(toListItem), total, window);
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

    return toListItem(created);
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

    return toListItem(updated);
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

    return toListItem(updated);
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

function toListItem(row: ServiceRow): ServiceListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    durationMin: row.durationMin,
    priceCents: row.priceCents,
    category: row.category,
    isCombo: row.isCombo,
    active: row.active,
    sortOrder: row.sortOrder,
    barberIds: row.barberServices.map((link) => link.barberId),
  };
}
