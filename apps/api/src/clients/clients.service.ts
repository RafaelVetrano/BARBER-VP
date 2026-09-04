import { Inject, Injectable } from '@nestjs/common';
import { LoyaltyPointsKind, OrderStatus, SubscriptionStatus, type Prisma } from '@prisma/client';
import type {
  ClientBulkBlockResult,
  ClientBulkMessageResult,
  ClientDetail,
  ClientHistoryEntry,
  ClientListCounts,
  ClientListItem,
  ClientListResponse,
  ClientLoyaltyEntry,
  ClientStatus,
  ClientSubscriptionSummary,
} from '@barbervp/types';
import { CLIENT_INACTIVE_DAYS, normalizeMobilePhone } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { pageWindow, toPaginated } from '../common/dto/pagination.dto';
import {
  NOTIFICATION_ADAPTER,
  type NotificationAdapter,
} from '../adapters/notification/notification.adapter';
import type { RequestContext } from '../common/types/request-context';
import type {
  ClientBulkBlockDto,
  ClientBulkMessageDto,
  ClientExportQueryDto,
  ClientListQueryDto,
  CreateClientDto,
  UpdateClientProfileDto,
} from './dto/clients.dto';

const CLIENT_INCLUDE = {
  client: { select: { id: true, name: true, phone: true, email: true, birthDate: true, notifyWhatsapp: true } },
  favoriteBarber: { select: { id: true, name: true } },
} satisfies Prisma.ClientProfileInclude;

type ClientProfileRow = Prisma.ClientProfileGetPayload<{ include: typeof CLIENT_INCLUDE }>;

/** Assinaturas que ainda fazem do cliente um mensalista. */
const SUBSCRIBER_STATUSES: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE];
/** ...e as que ainda merecem aparecer na aba "Assinatura" do drawer. */
const LIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [...SUBSCRIBER_STATUSES, SubscriptionStatus.PAUSED];

/** Quantas comandas e quantos lançamentos de ponto o drawer mostra. */
const HISTORY_LIMIT = 20;
const LOYALTY_LEDGER_LIMIT = 20;

/** Teto da exportação — o CSV é síncrono, não pode virar um dump sem fim. */
const EXPORT_LIMIT = 5_000;

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
    @Inject(NOTIFICATION_ADAPTER) private readonly notifications: NotificationAdapter,
  ) {}

  async list(tenantId: string, query: ClientListQueryDto): Promise<ClientListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const cutoff = inactiveCutoff();
    const base = this.baseWhere(tenantId, query);
    const where = this.withStatus(tenantId, base, query.status, cutoff);
    const orderBy = this.buildOrderBy(query);

    const [rows, total, counts] = await Promise.all([
      this.prisma.clientProfile.findMany({
        where,
        include: CLIENT_INCLUDE,
        orderBy,
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.clientProfile.count({ where }),
      // Os chips ignoram o status escolhido de propósito: senão o chip ativo
      // seria o único diferente de zero.
      this.countByStatus(tenantId, base, cutoff),
    ]);

    const items = await this.decorate(tenantId, rows, cutoff);
    return { ...toPaginated(items, total, window), counts };
  }

  /**
   * Perfil completo do drawer numa resposta só (`Dashboard.dc.html` l.3001).
   *
   * As quatro sub-abas viajam juntas porque o drawer troca de aba sem pedir
   * nada ao servidor — e porque histórico, extrato de pontos e assinatura são
   * consultas pequenas de UM cliente, não listagens.
   */
  async detail(tenantId: string, profileId: string): Promise<ClientDetail> {
    const cutoff = inactiveCutoff();
    const profile = await this.prisma.clientProfile.findFirst({
      where: { id: profileId, tenantId, deletedAt: null },
      include: CLIENT_INCLUDE,
    });
    if (!profile) {
      throw ApiException.notFound('Cliente não encontrado.');
    }

    const [item, history, subscription, ledger] = await Promise.all([
      this.decorateOne(tenantId, profile, cutoff),
      this.loadHistory(tenantId, profile.clientId),
      this.loadSubscription(tenantId, profile.clientId),
      this.loadLoyaltyLedger(tenantId, profile.clientId),
    ]);

    return {
      ...item,
      ticketAverageCents:
        profile.visitCount > 0 ? Math.round(profile.totalSpentCents / profile.visitCount) : 0,
      loyaltyEnabled: item.loyaltyPoints !== null,
      history,
      loyaltyLedger: ledger,
      subscription,
    };
  }

  /**
   * Cadastro do balcão — o "＋ Cadastrar novo cliente" do modal de agendamento
   * e o "+ Novo cliente" da aba Clientes (que preenche a ficha inteira).
   *
   * `Client` é identidade GLOBAL e `Client.phone` é único na plataforma: se a
   * pessoa já tem conta (cadastrada em outra barbearia, ou pelo booking
   * público), o registro é reaproveitado e só o `ClientProfile` deste tenant
   * nasce. Criar um segundo `Client` com o mesmo telefone estouraria o
   * `@unique` — e, pior, partiria o histórico da pessoa em dois.
   */
  async create(
    tenantId: string,
    dto: CreateClientDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ClientListItem> {
    const name = dto.name.trim();
    const phone = normalizeMobilePhone(dto.phone);
    if (!phone) {
      throw ApiException.badRequest('Telefone inválido. Use DDD + número de celular.');
    }
    const email = dto.email?.trim().toLowerCase() || null;
    const birthDate = dto.birthDate ? new Date(`${dto.birthDate}T00:00:00.000Z`) : null;
    if (birthDate && Number.isNaN(birthDate.getTime())) {
      throw ApiException.badRequest('Data de nascimento inválida.');
    }

    const profile = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.client.findUnique({
        where: { phone },
        select: { id: true, deletedAt: true, email: true },
      });

      // `Client.email` é único entre contas: um e-mail já usado por OUTRA
      // pessoa não pode derrubar o cadastro com um 500 do Prisma.
      if (email) {
        const emailOwner = await tx.client.findUnique({ where: { email }, select: { id: true } });
        if (emailOwner && emailOwner.id !== existing?.id) {
          throw ApiException.conflict('Este e-mail já pertence a outro cliente.');
        }
      }

      const client = existing
        ? await tx.client.update({
            where: { id: existing.id },
            data: {
              // Conta anonimizada por LGPD volta a existir com o novo nome.
              ...(existing.deletedAt ? { name, deletedAt: null } : {}),
              ...(email ? { email } : {}),
              ...(birthDate ? { birthDate } : {}),
              ...(dto.acceptsMessages === undefined ? {} : { notifyWhatsapp: dto.acceptsMessages }),
            },
            select: { id: true },
          })
        : await tx.client.create({
            data: {
              name,
              phone,
              email,
              birthDate,
              notifyWhatsapp: dto.acceptsMessages ?? true,
            },
            select: { id: true },
          });

      const already = await tx.clientProfile.findUnique({
        where: { tenantId_clientId: { tenantId, clientId: client.id } },
        select: { id: true, deletedAt: true },
      });
      if (already && !already.deletedAt) {
        throw ApiException.conflict('Este cliente já está cadastrado nesta barbearia.');
      }

      const notes = dto.notes?.trim() || null;
      return already
        ? tx.clientProfile.update({
            where: { id: already.id },
            data: { deletedAt: null, phone, notes },
            include: CLIENT_INCLUDE,
          })
        : tx.clientProfile.create({
            data: { tenantId, clientId: client.id, phone, notes },
            include: CLIENT_INCLUDE,
          });
    });

    await this.audit.record(
      {
        action: AuditAction.CLIENT_CREATED,
        entity: 'ClientProfile',
        entityId: profile.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return this.decorateOne(tenantId, profile, inactiveCutoff());
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

    return this.decorateOne(tenantId, updated, inactiveCutoff());
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

    return this.decorateOne(tenantId, updated, inactiveCutoff());
  }

  /**
   * Bloqueio/desbloqueio em lote da barra de seleção.
   *
   * O `updateMany` filtra por `tenantId` junto com os ids: id de outra
   * barbearia simplesmente não casa, e a resposta conta só o que mudou de
   * verdade — nunca "4 bloqueados" quando 2 eram de outro tenant.
   */
  async bulkSetBlocked(
    tenantId: string,
    dto: ClientBulkBlockDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ClientBulkBlockResult> {
    const owned = await this.prisma.clientProfile.findMany({
      where: { id: { in: dto.ids }, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (owned.length === 0) {
      return { updated: 0 };
    }
    const ids = owned.map((row) => row.id);

    const result = await this.prisma.clientProfile.updateMany({
      where: { id: { in: ids }, tenantId },
      data: { blocked: dto.blocked },
    });

    await Promise.all(
      ids.map((id) =>
        this.audit.record(
          {
            action: dto.blocked ? AuditAction.CLIENT_BLOCKED : AuditAction.CLIENT_UNBLOCKED,
            entity: 'ClientProfile',
            entityId: id,
            tenantId,
            actorUserId,
          },
          request,
        ),
      ),
    );

    return { updated: result.count };
  }

  /**
   * Disparo em lote pela barra de seleção.
   *
   * Quem desligou "aceita receber mensagens" (`Client.notifyWhatsapp`) é
   * pulado e contado em `skipped`: a tela precisa dizer que 3 de 10 não vão
   * receber, em vez de mentir que foram 10.
   */
  async bulkMessage(
    tenantId: string,
    dto: ClientBulkMessageDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ClientBulkMessageResult> {
    const owned = await this.prisma.clientProfile.findMany({
      where: { id: { in: dto.ids }, tenantId, deletedAt: null },
      include: { client: { select: { id: true, name: true, phone: true, notifyWhatsapp: true } } },
    });

    const allowed = owned.filter((row) => row.client.notifyWhatsapp);
    const body = dto.body.trim();

    for (const row of allowed) {
      await this.notifications.send({
        tenantId,
        recipient: row.client.phone,
        templateKey: 'CLIENT_BROADCAST',
        // `{nome}` é o mesmo placeholder dos templates de WhatsApp da fase 07.
        body: body.replace(/\{nome\}/g, row.client.name),
        payload: { clientProfileId: row.id, clientId: row.client.id },
      });
    }

    await this.audit.record(
      {
        action: AuditAction.CLIENT_BROADCAST_SENT,
        entity: 'Tenant',
        entityId: tenantId,
        tenantId,
        actorUserId,
        metadata: { requested: dto.ids.length, queued: allowed.length },
      },
      request,
    );

    return { queued: allowed.length, skipped: owned.length - allowed.length };
  }

  /**
   * CSV da lista — o "Exportar CSV" do topo (usa busca + chip) e o "Exportar"
   * da barra de seleção (usa `ids`). Um endpoint só porque é a mesma tabela;
   * o que muda é só o recorte.
   */
  async exportCsv(tenantId: string, query: ClientExportQueryDto): Promise<string> {
    const cutoff = inactiveCutoff();
    const ids = query.ids
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const base: Prisma.ClientProfileWhereInput = ids?.length
      ? { tenantId, deletedAt: null, id: { in: ids.slice(0, EXPORT_LIMIT) } }
      : this.baseWhere(tenantId, { search: query.search });

    const where = ids?.length ? base : this.withStatus(tenantId, base, query.status, cutoff);

    const rows = await this.prisma.clientProfile.findMany({
      where,
      include: CLIENT_INCLUDE,
      orderBy: { client: { name: 'asc' } },
      take: EXPORT_LIMIT,
    });
    const items = await this.decorate(tenantId, rows, cutoff);

    const header = [
      'Nome',
      'WhatsApp',
      'E-mail',
      'Nascimento',
      'Ultima visita',
      'Visitas',
      'Total gasto',
      'Pontos',
      'Faltas',
      'Status',
      'Barbeiro favorito',
      'Aceita mensagens',
    ];
    const lines = items.map((item) => [
      item.name,
      item.phone,
      item.email ?? '',
      item.birthDate ?? '',
      item.lastVisitAt ? item.lastVisitAt.slice(0, 10) : '',
      String(item.visitCount),
      (item.totalSpentCents / 100).toFixed(2).replace('.', ','),
      item.loyaltyPoints === null ? '' : String(item.loyaltyPoints),
      String(item.noShowCount),
      item.status,
      item.favoriteBarberName ?? '',
      item.acceptsMessages ? 'Sim' : 'Nao',
    ]);

    // BOM para o Excel pt-BR abrir acentuação correta; `;` porque a vírgula é
    // separador decimal no mesmo Excel.
    return `﻿${[header, ...lines].map((cells) => cells.map(csvCell).join(';')).join('\r\n')}\r\n`;
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

  /** Uma linha só — mesmo caminho de `decorate`, sem o `[0]` na chamada. */
  private async decorateOne(
    tenantId: string,
    row: ClientProfileRow,
    cutoff: Date,
  ): Promise<ClientListItem> {
    const [item] = await this.decorate(tenantId, [row], cutoff);
    // `decorate` devolve um item por linha recebida; o `?? ` só existe porque
    // `noUncheckedIndexedAccess` não sabe disso.
    return item ?? toListItem(row, { status: deriveStatus(row, false, cutoff), loyaltyPoints: null });
  }

  /**
   * Acrescenta às linhas o que não está na tabela: saldo de pontos (uma única
   * `groupBy` para a página inteira) e quem é mensalista (uma única consulta
   * de assinaturas vivas). Nada de consulta por linha.
   */
  private async decorate(
    tenantId: string,
    rows: ClientProfileRow[],
    cutoff: Date,
  ): Promise<ClientListItem[]> {
    if (rows.length === 0) return [];
    const clientIds = rows.map((row) => row.clientId);

    const [program, subscribers, points] = await Promise.all([
      this.prisma.loyaltyProgram.findUnique({
        where: { tenantId },
        select: { active: true },
      }),
      this.prisma.clientSubscription.findMany({
        where: { tenantId, clientId: { in: clientIds }, status: { in: SUBSCRIBER_STATUSES } },
        select: { clientId: true },
      }),
      this.prisma.loyaltyPoints.groupBy({
        by: ['clientId'],
        where: { tenantId, clientId: { in: clientIds } },
        _sum: { points: true },
      }),
    ]);

    const loyaltyOn = program?.active === true;
    const subscriberIds = new Set(subscribers.map((row) => row.clientId));
    const balance = new Map(points.map((row) => [row.clientId, row._sum.points ?? 0]));

    return rows.map((row) =>
      toListItem(row, {
        status: deriveStatus(row, subscriberIds.has(row.clientId), cutoff),
        loyaltyPoints: loyaltyOn ? (balance.get(row.clientId) ?? 0) : null,
      }),
    );
  }

  private async loadHistory(tenantId: string, clientId: string): Promise<ClientHistoryEntry[]> {
    const orders = await this.prisma.order.findMany({
      where: { tenantId, clientId, status: OrderStatus.CLOSED, deletedAt: null },
      orderBy: { closedAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        closedAt: true,
        openedAt: true,
        totalCents: true,
        barber: { select: { name: true } },
        items: { select: { description: true }, orderBy: { createdAt: 'asc' } },
        payments: { where: { deletedAt: null }, select: { method: true } },
      },
    });

    return orders.map((order) => ({
      orderId: order.id,
      date: (order.closedAt ?? order.openedAt).toISOString(),
      totalCents: order.totalCents,
      items: order.items.map((item) => item.description),
      barberName: order.barber?.name ?? null,
      paymentMethods: order.payments.map((payment) => payment.method),
    }));
  }

  private async loadLoyaltyLedger(tenantId: string, clientId: string): Promise<ClientLoyaltyEntry[]> {
    const entries = await this.prisma.loyaltyPoints.findMany({
      where: { tenantId, clientId },
      orderBy: { createdAt: 'desc' },
      take: LOYALTY_LEDGER_LIMIT,
      select: { id: true, createdAt: true, points: true, reason: true, kind: true },
    });

    return entries.map((entry) => ({
      id: entry.id,
      date: entry.createdAt.toISOString(),
      description: entry.reason ?? LOYALTY_KIND_LABEL[entry.kind],
      points: entry.points,
    }));
  }

  private async loadSubscription(
    tenantId: string,
    clientId: string,
  ): Promise<ClientSubscriptionSummary | null> {
    const subscription = await this.prisma.clientSubscription.findFirst({
      where: { tenantId, clientId, status: { in: LIVE_SUBSCRIPTION_STATUSES } },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        nextChargeAt: true,
        plan: { select: { name: true, priceCents: true } },
      },
    });
    if (!subscription) return null;

    const usages = await this.prisma.subscriptionUsage.findMany({
      where: { subscriptionId: subscription.id, periodStart: subscription.currentPeriodStart },
      select: { used: true, quota: true, service: { select: { name: true } } },
      orderBy: { service: { name: 'asc' } },
    });

    return {
      id: subscription.id,
      planName: subscription.plan.name,
      priceCents: subscription.plan.priceCents,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      nextChargeAt: subscription.nextChargeAt?.toISOString() ?? null,
      usages: usages.map((usage) => ({
        serviceName: usage.service.name,
        used: usage.used,
        quota: usage.quota,
      })),
      usedTotal: usages.reduce((sum, usage) => sum + usage.used, 0),
      quotaTotal: usages.reduce((sum, usage) => sum + usage.quota, 0),
    };
  }

  /** Tudo menos o filtro de status — é o recorte que os chips contam. */
  private baseWhere(
    tenantId: string,
    query: Pick<ClientListQueryDto, 'search' | 'favoriteBarberId' | 'blocked'>,
  ): Prisma.ClientProfileWhereInput {
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

  private withStatus(
    tenantId: string,
    base: Prisma.ClientProfileWhereInput,
    status: ClientStatus | undefined,
    cutoff: Date,
  ): Prisma.ClientProfileWhereInput {
    if (!status) return base;
    return { ...base, AND: [statusWhere(tenantId, status, cutoff)] };
  }

  private async countByStatus(
    tenantId: string,
    base: Prisma.ClientProfileWhereInput,
    cutoff: Date,
  ): Promise<ClientListCounts> {
    const count = (status?: ClientStatus) =>
      this.prisma.clientProfile.count({
        where: status ? { ...base, AND: [statusWhere(tenantId, status, cutoff)] } : base,
      });

    const [all, ativo, inativo, mensalista, bloqueado] = await Promise.all([
      count(),
      count('ATIVO'),
      count('INATIVO'),
      count('MENSALISTA'),
      count('BLOQUEADO'),
    ]);

    return { all, ativo, inativo, mensalista, bloqueado };
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

const LOYALTY_KIND_LABEL: Record<LoyaltyPointsKind, string> = {
  EARN: 'Ganho por consumo',
  REDEEM: 'Resgate de pontos',
  EXPIRE: 'Pontos expirados',
  ADJUST: 'Ajuste manual',
};

/** Corte de inatividade — hoje menos `CLIENT_INACTIVE_DAYS`. */
function inactiveCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - CLIENT_INACTIVE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * O `where` de cada chip. Mora fora da classe porque a listagem, as contagens
 * e a exportação precisam do MESMO recorte — e porque `deriveStatus` abaixo
 * tem de continuar concordando com ele.
 */
function statusWhere(
  tenantId: string,
  status: ClientStatus,
  cutoff: Date,
): Prisma.ClientProfileWhereInput {
  const subscriber: Prisma.ClientProfileWhereInput = {
    client: { subscriptions: { some: { tenantId, status: { in: SUBSCRIBER_STATUSES } } } },
  };
  const notSubscriber: Prisma.ClientProfileWhereInput = {
    client: { subscriptions: { none: { tenantId, status: { in: SUBSCRIBER_STATUSES } } } },
  };
  // Sem visita nenhuma e recém-cadastrado ainda não é "inativo" — é novo.
  const staleOr: Prisma.ClientProfileWhereInput[] = [
    { lastVisitAt: { lt: cutoff } },
    { AND: [{ lastVisitAt: null }, { createdAt: { lt: cutoff } }] },
  ];

  switch (status) {
    case 'BLOQUEADO':
      return { blocked: true };
    case 'MENSALISTA':
      return { blocked: false, ...subscriber };
    case 'INATIVO':
      return { blocked: false, ...notSubscriber, OR: staleOr };
    case 'ATIVO':
    default:
      return { blocked: false, ...notSubscriber, NOT: { OR: staleOr } };
  }
}

/** Mesma precedência de `statusWhere`, aplicada à linha já carregada. */
function deriveStatus(row: ClientProfileRow, isSubscriber: boolean, cutoff: Date): ClientStatus {
  if (row.blocked) return 'BLOQUEADO';
  if (isSubscriber) return 'MENSALISTA';
  const reference = row.lastVisitAt ?? row.createdAt;
  return reference.getTime() < cutoff.getTime() ? 'INATIVO' : 'ATIVO';
}

function csvCell(value: string): string {
  // `=`/`+`/`-`/`@` na primeira posição viram fórmula no Excel: prefixo com
  // aspa simples neutraliza a injeção de fórmula pelo nome do cliente.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toListItem(
  row: ClientProfileRow,
  extra: { status: ClientStatus; loyaltyPoints: number | null },
): ClientListItem {
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
    status: extra.status,
    loyaltyPoints: extra.loyaltyPoints,
    acceptsMessages: row.client.notifyWhatsapp,
  };
}
