import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ClientListItem, ClientListResponse } from '@barbervp/types';
import { normalizeMobilePhone } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { pageWindow, toPaginated } from '../common/dto/pagination.dto';
import type { RequestContext } from '../common/types/request-context';
import type { ClientListQueryDto, UpdateClientProfileDto } from './dto/clients.dto';

const CLIENT_INCLUDE = {
  client: { select: { id: true, name: true, phone: true, email: true, birthDate: true } },
  favoriteBarber: { select: { id: true, name: true } },
} satisfies Prisma.ClientProfileInclude;

type ClientProfileRow = Prisma.ClientProfileGetPayload<{ include: typeof CLIENT_INCLUDE }>;

/**
 * "Clientes" do dashboard — lê/escreve `ClientProfile`, o perfil do cliente
 * DENTRO desta barbearia. A identidade (`Client`) é global e não se cria nem
 * se apaga por aqui — só o registro fica visível/editável por tenant.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, query: ClientListQueryDto): Promise<ClientListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const where = await this.buildWhere(tenantId, query);
    const orderBy = this.buildOrderBy(query);

    const [rows, total] = await Promise.all([
      this.prisma.clientProfile.findMany({
        where,
        include: CLIENT_INCLUDE,
        orderBy,
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.clientProfile.count({ where }),
    ]);

    return toPaginated(rows.map(toListItem), total, window);
  }

  async update(
    tenantId: string,
    profileId: string,
    dto: UpdateClientProfileDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ClientListItem> {
    const existing = await this.loadOwned(tenantId, profileId);

    if (dto.favoriteBarberId) {
      const barber = await this.prisma.barber.findFirst({
        where: { id: dto.favoriteBarberId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!barber) {
        throw ApiException.badRequest('Barbeiro favorito inválido.');
      }
    }

    const updated = await this.prisma.clientProfile.update({
      where: { id: existing.id },
      data: {
        notes: dto.notes === undefined ? undefined : dto.notes,
        favoriteBarberId: dto.favoriteBarberId === undefined ? undefined : dto.favoriteBarberId,
      },
      include: CLIENT_INCLUDE,
    });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_PROFILE_ADMIN_UPDATED,
        entity: 'ClientProfile',
        entityId: updated.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return toListItem(updated);
  }

  async setBlocked(
    tenantId: string,
    profileId: string,
    blocked: boolean,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ClientListItem> {
    const existing = await this.loadOwned(tenantId, profileId);

    const updated = await this.prisma.clientProfile.update({
      where: { id: existing.id },
      data: { blocked },
      include: CLIENT_INCLUDE,
    });

    await this.audit.record(
      {
        action: blocked ? AuditAction.CLIENT_BLOCKED : AuditAction.CLIENT_UNBLOCKED,
        entity: 'ClientProfile',
        entityId: updated.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return toListItem(updated);
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private async loadOwned(tenantId: string, profileId: string): Promise<{ id: string }> {
    const profile = await this.prisma.clientProfile.findFirst({
      where: { id: profileId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!profile) {
      throw ApiException.notFound('Cliente não encontrado.');
    }
    return profile;
  }

  private async buildWhere(
    tenantId: string,
    query: ClientListQueryDto,
  ): Promise<Prisma.ClientProfileWhereInput> {
    const where: Prisma.ClientProfileWhereInput = { tenantId, deletedAt: null };

    if (query.favoriteBarberId) {
      where.favoriteBarberId = query.favoriteBarberId;
    }
    if (query.blocked !== undefined) {
      where.blocked = query.blocked === 'true';
    }

    const search = query.search?.trim();
    if (search) {
      const digits = normalizeMobilePhone(search) ?? search.replace(/\D/g, '');
      where.OR = [
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { client: { email: { contains: search, mode: 'insensitive' } } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
      ];
    }

    return where;
  }

  private buildOrderBy(query: ClientListQueryDto): Prisma.ClientProfileOrderByWithRelationInput {
    const order = query.order ?? 'desc';
    switch (query.sort) {
      case 'name':
        return { client: { name: query.order ?? 'asc' } };
      case 'visitCount':
        return { visitCount: order };
      case 'createdAt':
        return { createdAt: order };
      case 'lastVisitAt':
      default:
        return { lastVisitAt: order };
    }
  }
}

function toListItem(row: ClientProfileRow): ClientListItem {
  return {
    id: row.id,
    clientId: row.client.id,
    name: row.client.name,
    phone: row.client.phone,
    email: row.client.email,
    birthDate: row.client.birthDate ? row.client.birthDate.toISOString().slice(0, 10) : null,
    notes: row.notes,
    favoriteBarberId: row.favoriteBarberId,
    favoriteBarberName: row.favoriteBarber?.name ?? null,
    noShowCount: row.noShowCount,
    blocked: row.blocked,
    visitCount: row.visitCount,
    totalSpentCents: row.totalSpentCents,
    firstVisitAt: row.firstVisitAt?.toISOString() ?? null,
    lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
