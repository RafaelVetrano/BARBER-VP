import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  CashMovementType,
  CashRegisterStatus,
  CommissionEntryStatus,
  DiscountType,
  LoyaltyPointsKind,
  OrderItemKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import type {
  OrderDetail,
  OrderListCounts,
  OrderListItem,
  OrderListQuery,
  OrderListResponse,
  PosCatalogResponse,
} from '@barbervp/types';
import { ErrorCode, applyPercentDiscount } from '@barbervp/types';
import { PrismaService, type PrismaTransaction } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { pageWindow, toPaginated } from '../common/dto/pagination.dto';
import { addDays, toDateKey, zonedTimeToUtc } from '../common/utils/timezone';
import type { StaffScope } from '../staff-agenda/staff-scope.service';
import { SubscriptionCoverageService } from '../booking/subscription-coverage.service';
import { CommissionCalcService, monthStart } from '../commissions/commission-calc.service';
import type {
  AddOrderItemDto,
  ApplyOrderDiscountDto,
  AssignOrderDto,
  CloseOrderDto,
  OpenOrderDto,
  RedeemOrderLoyaltyDto,
  ReopenOrderDto,
  UpdateOrderItemDto,
} from './dto/pos.dto';

const ORDER_INCLUDE = {
  client: { select: { id: true, name: true } },
  barber: { select: { id: true, name: true } },
  items: { include: { barber: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** Uma linha do agendamento pronta para virar `OrderItem` (agente 31). */
interface AppointmentSeedLine {
  serviceId: string;
  description: string;
  unitPriceCents: number;
  coveredBySubscription: boolean;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly coverage: SubscriptionCoverageService,
    private readonly commissionCalc: CommissionCalcService,
  ) {}

  // ── Catálogo do balcão ───────────────────────────────────────────────────

  async catalog(tenantId: string): Promise<PosCatalogResponse> {
    const [services, products, barbers, last] = await Promise.all([
      this.prisma.service.findMany({
        where: { tenantId, active: true },
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceCents: true,
          category: true,
          barberServices: { select: { barberId: true } },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { tenantId, active: true },
        select: { id: true, name: true, priceCents: true, stock: true, category: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.barber.findMany({
        where: { tenantId, active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.order.aggregate({ where: { tenantId }, _max: { number: true } }),
    ]);

    return {
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        durationMin: service.durationMin,
        priceCents: service.priceCents,
        category: service.category,
        barberIds: service.barberServices.map((row) => row.barberId),
      })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        stock: product.stock,
        category: product.category,
      })),
      barbers,
      nextNumber: (last._max.number ?? 0) + 1,
    };
  }

  // ── Listagem/detalhe ─────────────────────────────────────────────────────

  async list(tenantId: string, scope: StaffScope, query: OrderListQuery): Promise<OrderListResponse> {
    const window = pageWindow(query.page, query.perPage);
    // O recorte de "hoje" é o dia da BARBEARIA. Usar o dia do servidor faria a
    // aba "Fechadas hoje" virar às 21h em qualquer deploy fora de -03.
    const today = await this.todayRange(tenantId);
    const base = this.baseWhere(tenantId, scope, query);
    const where: Prisma.OrderWhereInput = {
      ...base,
      ...(query.status ? { status: query.status } : {}),
      ...(query.closedToday ? { closedAt: { gte: today.start, lt: today.end } } : {}),
    };

    const [rows, total, counts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy:
          query.status === OrderStatus.CLOSED
            ? { closedAt: 'desc' }
            : query.status === OrderStatus.CANCELED
              ? { canceledAt: 'desc' }
              : { openedAt: 'desc' },
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.order.count({ where }),
      // As abas ignoram a aba escolhida (mesma regra dos chips de Clientes) mas
      // respeitam a busca — senão a contagem contradiz a lista logo abaixo.
      this.countTabs(base, today),
    ]);

    return { ...toPaginated(rows.map(toListItem), total, window), counts };
  }

  /** Tenant + recorte do BARBER + busca — a parte comum da lista e das contagens. */
  private baseWhere(tenantId: string, scope: StaffScope, query: OrderListQuery): Prisma.OrderWhereInput {
    const search = query.search?.trim();
    const asNumber = search && /^#?\d+$/.test(search) ? Number(search.replace('#', '')) : undefined;

    return {
      tenantId,
      deletedAt: null,
      ...(scope.forcedBarberId ? { barberId: scope.forcedBarberId } : query.barberId ? { barberId: query.barberId } : {}),
      ...(search
        ? {
            OR: [
              { client: { name: { contains: search, mode: 'insensitive' } } },
              { guestName: { contains: search, mode: 'insensitive' } },
              ...(asNumber === undefined ? [] : [{ number: asNumber }]),
            ],
          }
        : {}),
    };
  }

  private async countTabs(
    base: Prisma.OrderWhereInput,
    today: { start: Date; end: Date },
  ): Promise<OrderListCounts> {
    const [abertas, fechadasHoje] = await Promise.all([
      this.prisma.order.count({ where: { ...base, status: OrderStatus.OPEN } }),
      this.prisma.order.count({
        where: { ...base, status: OrderStatus.CLOSED, closedAt: { gte: today.start, lt: today.end } },
      }),
    ]);
    return { abertas, fechadasHoje };
  }

  /** Meia-noite a meia-noite do dia corrente NO FUSO da barbearia. */
  private async todayRange(tenantId: string): Promise<{ start: Date; end: Date }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const timezone = tenant?.timezone ?? 'America/Sao_Paulo';
    const key = toDateKey(new Date(), timezone);
    return {
      start: zonedTimeToUtc(key, 0, timezone),
      end: zonedTimeToUtc(addDays(key, 1), 0, timezone),
    };
  }

  async detail(tenantId: string, scope: StaffScope, id: string): Promise<OrderDetail> {
    const order = await this.loadOwned(tenantId, scope, id);
    return this.toDetail(tenantId, order);
  }

  // ── Abrir ────────────────────────────────────────────────────────────────

  async open(
    tenantId: string,
    scope: StaffScope,
    dto: OpenOrderDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<OrderDetail> {
    let barberId = dto.barberId ?? null;
    let clientId = dto.clientId ?? null;
    let guestName: string | null = dto.walkIn?.name ?? null;

    /**
     * Linhas que a comanda nascida de um agendamento já traz (agente 31).
     *
     * O agendamento diz o que vai ser feito e por quanto; a comanda nascia
     * VAZIA e o balcão tinha que redigitar tudo — "Barba + Corte degradê" no
     * agendamento, "Nenhum item adicionado ainda" na comanda.
     */
    let seedLines: AppointmentSeedLine[] = [];

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: { id: dto.appointmentId, tenantId },
        select: {
          id: true,
          barberId: true,
          clientId: true,
          guestName: true,
          order: { select: { id: true } },
          services: {
            orderBy: { sortOrder: 'asc' },
            select: {
              serviceId: true,
              priceCents: true,
              subscriptionUsageId: true,
              service: { select: { name: true } },
            },
          },
        },
      });
      if (!appointment) {
        throw ApiException.notFound('Agendamento não encontrado.');
      }
      if (appointment.order) {
        throw ApiException.conflict('Este agendamento já tem uma comanda aberta.', 'ORDER_ALREADY_EXISTS');
      }
      // `BARBER` só abre comanda do PRÓPRIO atendimento. Sem esta linha o
      // recorte do papel virava um jeito de reivindicar o atendimento de
      // outro: `scope.forcedBarberId` logo abaixo trocava o barbeiro da
      // comanda para quem chamou.
      if (scope.forcedBarberId && appointment.barberId !== scope.forcedBarberId) {
        throw ApiException.forbidden('Você só pode abrir comanda dos próprios atendimentos.');
      }
      barberId = barberId ?? appointment.barberId;
      clientId = clientId ?? appointment.clientId;
      guestName = guestName ?? appointment.guestName;
      seedLines = appointment.services.map((line) => ({
        serviceId: line.serviceId,
        description: line.service.name,
        // O preço FOTOGRAFADO na reserva, não o de tabela de hoje: é o que o
        // cliente combinou, e é o que o drawer da Agenda mostra.
        unitPriceCents: line.priceCents,
        coveredBySubscription: line.subscriptionUsageId !== null,
      }));
    }

    if (scope.forcedBarberId) {
      barberId = scope.forcedBarberId;
    }

    if (!clientId && !guestName) {
      throw ApiException.badRequest('Informe o cliente cadastrado ou os dados do walk-in.');
    }

    const last = await this.prisma.order.aggregate({ where: { tenantId }, _max: { number: true } });

    const order = await this.prisma.order.create({
      data: {
        tenantId,
        number: (last._max.number ?? 0) + 1,
        clientId,
        guestName: clientId ? null : guestName,
        barberId,
        appointmentId: dto.appointmentId ?? null,
        status: OrderStatus.OPEN,
      },
      include: ORDER_INCLUDE,
    });

    if (seedLines.length > 0) {
      await this.prisma.orderItem.createMany({
        data: seedLines.map((line) => ({
          tenantId,
          orderId: order.id,
          kind: OrderItemKind.SERVICE,
          serviceId: line.serviceId,
          barberId,
          description: line.description,
          quantity: 1,
          unitPriceCents: line.unitPriceCents,
          totalCents: line.unitPriceCents,
          coveredBySubscription: line.coveredBySubscription,
          /*
           * `subscriptionUsageId` fica NULO de propósito, mesmo na linha
           * coberta.
           *
           * A quota já foi debitada na RESERVA (`Appointment` grava o
           * `subscriptionUsageId` da linha e `SubscriptionCoverageService.debit`
           * roda ali). Copiar o id para cá faria `close()` debitar a MESMA
           * quota uma segunda vez — quatro cortes do plano viravam dois. Quem
           * segura a reserva é o agendamento; a comanda só herda o preço zero.
           */
          subscriptionUsageId: null,
        })),
      });
      await this.recompute(this.prisma, order.id);
    }

    await this.audit.record(
      {
        action: AuditAction.ORDER_OPENED,
        entity: 'Order',
        entityId: order.id,
        tenantId,
        actorUserId,
        metadata: { appointmentId: dto.appointmentId ?? null, seededItems: seedLines.length },
      },
      request,
    );

    return this.detail(tenantId, scope, order.id);
  }

  /**
   * Troca cliente e/ou barbeiro de uma comanda ABERTA — o link "trocar" do
   * cabeçalho do modal (l.3170).
   *
   * Trocar o cliente REAVALIA a cobertura de assinatura item a item: o preço
   * zero foi fotografado no `OrderItem` em nome do cliente anterior, e deixá-lo
   * como está entregaria de graça um serviço que o novo cliente não assina (ou
   * cobraria cheio de quem assina). O resgate de pontos também cai — o saldo é
   * de quem saiu.
   */
  async assign(
    tenantId: string,
    scope: StaffScope,
    orderId: string,
    dto: AssignOrderDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<OrderDetail> {
    const order = await this.loadOwned(tenantId, scope, orderId, OrderStatus.OPEN);

    if (scope.forcedBarberId && dto.barberId !== undefined && dto.barberId !== scope.forcedBarberId) {
      throw ApiException.forbidden('Você só pode manter as próprias comandas.');
    }

    const data: Prisma.OrderUpdateInput = {};

    if (dto.barberId !== undefined) {
      if (dto.barberId) {
        const barber = await this.prisma.barber.findFirst({
          where: { id: dto.barberId, tenantId, active: true },
          select: { id: true },
        });
        if (!barber) {
          throw ApiException.notFound('Barbeiro não encontrado.');
        }
        data.barber = { connect: { id: dto.barberId } };
      } else {
        data.barber = { disconnect: true };
      }
    }

    const changesClient = dto.clientId !== undefined || dto.walkIn !== undefined;
    let nextClientId = order.clientId;

    if (changesClient) {
      if (dto.clientId) {
        const profile = await this.prisma.clientProfile.findFirst({
          where: { clientId: dto.clientId, tenantId, deletedAt: null },
          select: { clientId: true },
        });
        if (!profile) {
          throw ApiException.notFound('Cliente não encontrado nesta barbearia.');
        }
        nextClientId = dto.clientId;
        data.client = { connect: { id: dto.clientId } };
        data.guestName = null;
      } else if (dto.walkIn) {
        nextClientId = null;
        if (order.clientId) data.client = { disconnect: true };
        data.guestName = dto.walkIn.name;
      } else {
        throw ApiException.badRequest('Informe o cliente cadastrado ou os dados do walk-in.');
      }
      // O saldo de pontos é do cliente que saiu.
      data.useLoyalty = false;
    }

    await this.prisma.order.update({ where: { id: orderId }, data });

    if (changesClient && nextClientId !== order.clientId) {
      await this.recoverService(tenantId, orderId, nextClientId);
    }

    await this.recompute(this.prisma, orderId);

    await this.audit.record(
      { action: AuditAction.ORDER_UPDATED, entity: 'Order', entityId: orderId, tenantId, actorUserId },
      request,
    );

    return this.detail(tenantId, scope, orderId);
  }

  /**
   * Reprecifica os itens de SERVIÇO da comanda para o cliente que passou a ser
   * o dono dela. Produto não muda: assinatura cobre serviço, nunca mercadoria.
   */
  private async recoverService(tenantId: string, orderId: string, clientId: string | null): Promise<void> {
    const items = await this.prisma.orderItem.findMany({
      where: { tenantId, orderId, kind: OrderItemKind.SERVICE, serviceId: { not: null } },
      select: { id: true, serviceId: true, quantity: true, coveredBySubscription: true },
    });
    if (items.length === 0) {
      return;
    }

    const serviceIds = [...new Set(items.map((item) => item.serviceId as string))];
    const [services, coverage] = await Promise.all([
      this.prisma.service.findMany({
        where: { id: { in: serviceIds }, tenantId },
        select: { id: true, priceCents: true },
      }),
      this.coverage.coverageFor(tenantId, clientId, serviceIds),
    ]);
    const priceOf = new Map(services.map((service) => [service.id, service.priceCents]));

    for (const item of items) {
      const serviceId = item.serviceId as string;
      const covered = coverage.get(serviceId);
      // Mesma regra de `addItem`: a assinatura cobre UMA unidade por item.
      const nowCovered = Boolean(covered && !covered.exhausted && item.quantity === 1);
      const unitPriceCents = nowCovered ? 0 : (priceOf.get(serviceId) ?? 0);

      await this.prisma.orderItem.update({
        where: { id: item.id },
        data: {
          coveredBySubscription: nowCovered,
          subscriptionUsageId: nowCovered ? (covered?.usageId ?? null) : null,
          unitPriceCents,
          totalCents: unitPriceCents * item.quantity,
        },
      });
    }
  }

  // ── Itens ────────────────────────────────────────────────────────────────

  async addItem(tenantId: string, scope: StaffScope, orderId: string, dto: AddOrderItemDto): Promise<OrderDetail> {
    const order = await this.loadOwned(tenantId, scope, orderId, OrderStatus.OPEN);
    const quantity = dto.quantity ?? 1;
    const barberId = dto.barberId ?? order.barberId ?? null;

    if (dto.kind === OrderItemKind.SERVICE) {
      if (!dto.serviceId) {
        throw ApiException.badRequest('Informe o serviço.');
      }
      const service = await this.prisma.service.findFirst({
        where: { id: dto.serviceId, tenantId, active: true },
        select: { id: true, name: true, priceCents: true },
      });
      if (!service) {
        throw ApiException.notFound('Serviço não encontrado.');
      }

      let coveredBySubscription = false;
      let subscriptionUsageId: string | null = null;
      let unitPriceCents = service.priceCents;

      if (order.clientId && quantity === 1) {
        const coverageMap = await this.coverage.coverageFor(tenantId, order.clientId, [service.id]);
        const covered = coverageMap.get(service.id);
        if (covered && !covered.exhausted) {
          coveredBySubscription = true;
          subscriptionUsageId = covered.usageId;
          unitPriceCents = 0;
        }
      }

      await this.prisma.orderItem.create({
        data: {
          tenantId,
          orderId,
          kind: OrderItemKind.SERVICE,
          serviceId: service.id,
          barberId,
          description: service.name,
          quantity,
          unitPriceCents,
          totalCents: unitPriceCents * quantity,
          coveredBySubscription,
          subscriptionUsageId,
        },
      });
    } else {
      if (!dto.productId) {
        throw ApiException.badRequest('Informe o produto.');
      }
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, tenantId, active: true },
        select: { id: true, name: true, priceCents: true, stock: true },
      });
      if (!product) {
        throw ApiException.notFound('Produto não encontrado.');
      }
      // Sem esta checagem o erro só apareceria no fechamento, como violação da
      // CHECK `product_stock_non_negative` — um 500 sem explicação, depois de
      // o cliente já estar no caixa.
      if (quantity > product.stock) {
        throw ApiException.badRequest(
          `Estoque insuficiente de ${product.name}: restam ${product.stock} unidade(s).`,
        );
      }

      await this.prisma.orderItem.create({
        data: {
          tenantId,
          orderId,
          kind: OrderItemKind.PRODUCT,
          productId: product.id,
          barberId,
          description: product.name,
          quantity,
          unitPriceCents: product.priceCents,
          totalCents: product.priceCents * quantity,
        },
      });
    }

    await this.recompute(this.prisma, orderId);
    return this.detail(tenantId, scope, orderId);
  }

  async updateItemQuantity(
    tenantId: string,
    scope: StaffScope,
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemDto,
  ): Promise<OrderDetail> {
    await this.loadOwned(tenantId, scope, orderId, OrderStatus.OPEN);
    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, tenantId, orderId } });
    if (!item) {
      throw ApiException.notFound('Item não encontrado.');
    }
    if (item.coveredBySubscription) {
      throw ApiException.badRequest('Item coberto pela assinatura não pode mudar de quantidade — remova e adicione de novo.');
    }

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity, totalCents: item.unitPriceCents * dto.quantity },
    });

    await this.recompute(this.prisma, orderId);
    return this.detail(tenantId, scope, orderId);
  }

  async removeItem(tenantId: string, scope: StaffScope, orderId: string, itemId: string): Promise<OrderDetail> {
    await this.loadOwned(tenantId, scope, orderId, OrderStatus.OPEN);
    const deleted = await this.prisma.orderItem.deleteMany({ where: { id: itemId, tenantId, orderId } });
    if (deleted.count === 0) {
      throw ApiException.notFound('Item não encontrado.');
    }

    await this.recompute(this.prisma, orderId);
    return this.detail(tenantId, scope, orderId);
  }

  async applyDiscount(
    tenantId: string,
    scope: StaffScope,
    orderId: string,
    dto: ApplyOrderDiscountDto,
  ): Promise<OrderDetail> {
    await this.loadOwned(tenantId, scope, orderId, OrderStatus.OPEN);
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        discountType: dto.discountType,
        discountValue: dto.discountType ? dto.discountValue : 0,
      },
    });

    await this.recompute(this.prisma, orderId);
    return this.detail(tenantId, scope, orderId);
  }

  async redeemLoyalty(
    tenantId: string,
    scope: StaffScope,
    orderId: string,
    dto: RedeemOrderLoyaltyDto,
  ): Promise<OrderDetail> {
    await this.loadOwned(tenantId, scope, orderId, OrderStatus.OPEN);
    await this.prisma.order.update({ where: { id: orderId }, data: { useLoyalty: dto.useLoyalty } });

    await this.recompute(this.prisma, orderId);
    return this.detail(tenantId, scope, orderId);
  }

  /** Recalcula subtotal/desconto/fidelidade/total — chamado após toda mutação de item/desconto/fidelidade. */
  private async recompute(db: PrismaTransaction | PrismaService, orderId: string): Promise<void> {
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });

    const subtotalCents = order.items.reduce((sum, item) => sum + item.totalCents, 0);

    let discountCents = 0;
    if (order.discountType === DiscountType.PERCENT) {
      discountCents = subtotalCents - applyPercentDiscount(subtotalCents, order.discountValue);
    } else if (order.discountType === DiscountType.FIXED) {
      discountCents = Math.min(order.discountValue, subtotalCents);
    }

    let loyaltyPointsUsed = 0;
    let loyaltyDiscountCents = 0;
    if (order.useLoyalty && order.clientId) {
      const program = await db.loyaltyProgram.findUnique({ where: { tenantId: order.tenantId } });
      if (program?.active) {
        const balance = await db.loyaltyPoints.aggregate({
          where: { tenantId: order.tenantId, clientId: order.clientId },
          _sum: { points: true },
        });
        const points = balance._sum.points ?? 0;
        if (points >= program.pontosParaDesconto) {
          loyaltyPointsUsed = program.pontosParaDesconto;
          loyaltyDiscountCents = Math.min(program.valorDesconto, subtotalCents - discountCents);
        }
      }
    }

    const totalCents = Math.max(0, subtotalCents - discountCents - loyaltyDiscountCents);

    await db.order.update({
      where: { id: orderId },
      data: { subtotalCents, discountCents, loyaltyPointsUsed, loyaltyDiscountCents, totalCents },
    });
  }

  // ── Fechamento (transação única) ────────────────────────────────────────

  async close(
    tenantId: string,
    scope: StaffScope,
    orderId: string,
    dto: CloseOrderDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<OrderDetail> {
    await this.loadOwned(tenantId, scope, orderId, OrderStatus.OPEN);

    /*
     * CORTESIA (agente 31) — o outro jeito de fechar.
     *
     * R$ 0 legítimo existe: refazer um corte que saiu ruim, um brinde, um
     * serviço que a assinatura já cobriu. Antes disto o botão "Fechar comanda"
     * ficava `disabled` e a comanda não fechava nem cancelava — regra 4
     * violada, e um balcão travado.
     *
     * Cortesia é o fechamento INTEIRO, nunca uma parcela: um pagamento só, de
     * valor zero, com motivo. O que a comanda teria cobrado vai para
     * `courtesyCents` — sem ele o número se perderia (o `totalCents` de uma
     * comanda fechada por cortesia é zero, por definição) e o relatório não
     * teria como dizer quanto a casa deu de graça.
     */
    const isCourtesy = dto.payments.some((payment) => payment.method === PaymentMethod.COURTESY);
    const courtesyReason = dto.courtesyReason?.trim() ?? '';

    if (isCourtesy) {
      const [only] = dto.payments;
      if (dto.payments.length !== 1 || !only || only.amountCents !== 0) {
        throw ApiException.badRequest(
          'Cortesia é o fechamento inteiro: um único pagamento, de R$ 0,00.',
          undefined,
          ErrorCode.COURTESY_CANNOT_SPLIT,
        );
      }
    }
    // Um método real com valor zero seria um fechamento sem cobrar disfarçado
    // de Pix — a soma bateria com um total zero e nada explicaria o R$ 0.
    for (const payment of dto.payments) {
      if (payment.method !== PaymentMethod.COURTESY && payment.amountCents <= 0) {
        throw ApiException.badRequest('Todo pagamento precisa de um valor maior que zero.');
      }
    }

    const paymentsSum = dto.payments.reduce((sum, payment) => sum + payment.amountCents, 0);

    const closed = await this.prisma.$transaction(async (tx) => {
      // Recalcula dentro da transação — a comanda pode ter sido mexida entre a
      // última leitura do front e o clique em "Finalizar".
      await this.recompute(tx, orderId);

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          items: true,
          appointment: { select: { id: true } },
          // O nome vai na descrição da movimentação de caixa ("Comanda #341 —
          // Lucas Ferreira"), como no extrato do protótipo.
          client: { select: { name: true } },
        },
      });

      if (order.status !== OrderStatus.OPEN) {
        throw ApiException.conflict('Esta comanda não está aberta.', 'ORDER_NOT_OPEN');
      }
      if (order.items.length === 0) {
        throw ApiException.badRequest(
          'Adicione ao menos um item antes de fechar a comanda.',
          undefined,
          ErrorCode.ORDER_EMPTY,
        );
      }

      // Reconfirma a cobertura de assinatura DENTRO da transação — débito
      // atômico, `used < quota` — e recobra o item na hora se a quota
      // esgotou entre o "adicionar item" e o "fechar".
      let subtotalCents = 0;
      for (const item of order.items) {
        if (item.coveredBySubscription && item.subscriptionUsageId) {
          const debited = await this.coverage.debit(tx, item.subscriptionUsageId);
          if (!debited) {
            const service = await tx.service.findUnique({
              where: { id: item.serviceId! },
              select: { priceCents: true },
            });
            const fullPrice = (service?.priceCents ?? 0) * item.quantity;
            await tx.orderItem.update({
              where: { id: item.id },
              data: {
                coveredBySubscription: false,
                subscriptionUsageId: null,
                unitPriceCents: service?.priceCents ?? 0,
                totalCents: fullPrice,
              },
            });
            item.totalCents = fullPrice;
          }
        }
        subtotalCents += item.totalCents;
      }

      /*
       * RESGATE DE PONTOS — reconfirmado aqui, e sob trava.
       *
       * O saldo é a SOMA de um ledger (`LoyaltyPoints`), não uma coluna: não há
       * linha única contra a qual fazer o débito condicional que a quota de
       * assinatura usa logo acima. Duas comandas abertas do MESMO cliente,
       * ambas com `useLoyalty`, fechando ao mesmo tempo liam as duas o mesmo
       * saldo e resgatavam duas vezes — o saldo terminava NEGATIVO e a
       * barbearia dava dois descontos onde havia crédito para um.
       *
       * A trava consultiva serializa por (tenant, cliente) até o fim da
       * transação. Não é a `ClientProfile` porque nem todo cliente com pontos
       * tem perfil nesta barbearia, e uma trava que às vezes não tranca é pior
       * que nenhuma. Colisão de hash apenas serializa dois clientes sem
       * relação por um instante — barato, e do lado seguro.
       */
      // A cortesia perdoa o total inteiro; gastar pontos para descontar de um
      // R$ 0 queimaria o saldo do cliente à toa.
      if (!isCourtesy && order.clientId && order.loyaltyPointsUsed > 0) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${order.clientId}`})::bigint)
        `;

        const confirmed = await tx.loyaltyPoints.aggregate({
          where: { tenantId, clientId: order.clientId },
          _sum: { points: true },
        });

        if ((confirmed._sum.points ?? 0) < order.loyaltyPointsUsed) {
          throw ApiException.conflict(
            'O saldo de pontos deste cliente mudou e não cobre mais o resgate. ' +
              'Reabra a comanda para recalcular o total.',
            'LOYALTY_BALANCE_CHANGED',
          );
        }
      }

      let discountCents = 0;
      if (order.discountType === DiscountType.PERCENT) {
        discountCents = subtotalCents - applyPercentDiscount(subtotalCents, order.discountValue);
      } else if (order.discountType === DiscountType.FIXED) {
        discountCents = Math.min(order.discountValue, subtotalCents);
      }
      const loyaltyDiscountCents = isCourtesy
        ? 0
        : Math.min(order.loyaltyDiscountCents, subtotalCents - discountCents);
      const dueCents = Math.max(0, subtotalCents - discountCents - loyaltyDiscountCents);

      // O motivo é obrigatório sempre que a comanda fecha sem cobrar — tanto
      // na cortesia explícita quanto no total zero de origem (tudo coberto
      // pela assinatura, ou 100% de desconto). O R$ 0 não é impedido; é
      // registrado com a razão dele.
      if (isCourtesy || dueCents === 0) {
        if (courtesyReason.length < 5 || courtesyReason.length > 200) {
          throw ApiException.badRequest(
            'Informe o motivo da cortesia (entre 5 e 200 caracteres).',
            undefined,
            ErrorCode.COURTESY_REASON_REQUIRED,
          );
        }
      }
      if (dueCents === 0 && !isCourtesy) {
        throw ApiException.badRequest(
          'Comanda sem valor a cobrar fecha como cortesia.',
          undefined,
          ErrorCode.ORDER_ZERO_TOTAL_REQUIRES_COURTESY,
        );
      }

      // Cortesia perdoa o que havia a cobrar: o total FECHADO é zero e
      // `courtesyCents` guarda o que teria sido cobrado.
      const courtesyCents = isCourtesy ? dueCents : 0;
      const totalCents = isCourtesy ? 0 : dueCents;

      if (paymentsSum !== totalCents) {
        throw ApiException.badRequest(
          `A soma dos pagamentos (${paymentsSum}) não bate com o total da comanda (${totalCents}).`,
        );
      }

      const now = new Date();
      const referenceMonth = monthStart(now);

      // Baixa de estoque dos produtos vendidos. O estoque é reconferido AQUI
      // (e não só no `addItem`) porque outra comanda pode ter levado a última
      // unidade no meio do caminho — sem isto, a CHECK
      // `product_stock_non_negative` derrubaria a transação com um 500 sem
      // explicação em vez de um 400 que diz o que houve.
      for (const item of order.items) {
        if (item.kind === OrderItemKind.PRODUCT && item.productId) {
          const updatedRows = await tx.$executeRaw`
            UPDATE "Product"
            SET "stock" = "stock" - ${item.quantity}, "updatedAt" = NOW()
            WHERE "id" = ${item.productId} AND "stock" >= ${item.quantity}
          `;
          if (updatedRows !== 1) {
            throw ApiException.badRequest(
              `Estoque insuficiente de ${item.description} para fechar a comanda.`,
            );
          }
        }
      }

      // Comissão por item com barbeiro atribuído. Serviço entra na faixa da
      // regra; produto usa o "% produtos" dela — a coluna "Comissão produtos"
      // da aba Comissões (`Dashboard.dc.html` l.1141) sai daqui. Regra com 0%
      // de produto (o padrão) não gera lançamento nenhum.
      //
      // Cortesia não gera comissão: não houve receita para repartir. (Com base
      // zero a regra de faixa devolveria zero de qualquer jeito — pular evita
      // encher a aba Comissões de linhas de R$ 0,00 sem sentido.)
      for (const item of isCourtesy ? [] : order.items) {
        if (!item.barberId) continue;
        const params = {
          tenantId,
          barberId: item.barberId,
          orderId,
          orderItemId: item.id,
          baseCents: item.totalCents,
          referenceMonth,
        };
        if (item.kind === OrderItemKind.SERVICE) {
          await this.commissionCalc.recordServiceEntry(tx, {
            ...params,
            serviceId: item.serviceId,
          });
        } else {
          await this.commissionCalc.recordProductEntry(tx, params);
        }
      }

      // Pagamentos.
      await tx.payment.createMany({
        data: dto.payments.map((payment) => ({
          tenantId,
          orderId,
          method: payment.method,
          status: PaymentStatus.PAID,
          amountCents: payment.amountCents,
          paidAt: now,
        })),
      });

      // Caixa — TODA venda entra no registro aberto, uma movimentação por forma
      // de pagamento. O extrato do dia da aba Financeiro lista Pix e cartão ao
      // lado do dinheiro (`Dashboard.dc.html` l.789); a conferência do
      // fechamento é que filtra só o que passou pela gaveta.
      // `COURTESY` NÃO passa pelo caixa nem por conta bancária — é R$ 0, e uma
      // movimentação de zero real no extrato do dia é só ruído. Por isso a
      // consulta ao registro nem acontece numa cortesia.
      const register = isCourtesy
        ? null
        : await tx.cashRegister.findFirst({
            where: { tenantId, status: CashRegisterStatus.OPEN },
            select: { id: true },
          });
      if (register) {
        const clientLabel = order.client?.name ?? order.guestName ?? null;
        await tx.cashMovement.createMany({
          data: dto.payments.map((payment) => ({
            tenantId,
            cashRegisterId: register.id,
            type: CashMovementType.SALE,
            amountCents: payment.amountCents,
            description: clientLabel
              ? `Comanda #${order.number} — ${clientLabel}`
              : `Comanda #${order.number}`,
            category: orderCategoryLabel(order.items),
            method: payment.method,
            orderId,
            createdByUserId: actorUserId,
          })),
        });
      }

      // Marca o agendamento vinculado como concluído.
      if (order.appointmentId) {
        await tx.appointment.update({
          where: { id: order.appointmentId },
          data: { status: AppointmentStatus.DONE },
        });
      }

      // Pontos de fidelidade — `Math.round(subtotal / gastoPorPonto)`. Cortesia
      // não pontua: o cliente não gastou nada.
      if (order.clientId) {
        const program = isCourtesy ? null : await tx.loyaltyProgram.findUnique({ where: { tenantId } });
        if (program?.active) {
          const earned = Math.round(subtotalCents / program.gastoPorPonto);
          if (earned > 0) {
            await tx.loyaltyPoints.create({
              data: {
                tenantId,
                clientId: order.clientId,
                points: earned,
                kind: LoyaltyPointsKind.EARN,
                orderId,
                reason: `Comanda #${order.number}`,
                expiresAt: program.expiracaoMeses
                  ? new Date(now.getFullYear(), now.getMonth() + program.expiracaoMeses, now.getDate())
                  : null,
              },
            });
          }
          if (order.loyaltyPointsUsed > 0) {
            await tx.loyaltyPoints.create({
              data: {
                tenantId,
                clientId: order.clientId,
                points: -order.loyaltyPointsUsed,
                kind: LoyaltyPointsKind.REDEEM,
                orderId,
                reason: `Resgate na comanda #${order.number}`,
              },
            });
          }
        }

        // Atualiza o perfil do cliente NESTA barbearia.
        await tx.clientProfile.updateMany({
          where: { tenantId, clientId: order.clientId },
          data: {
            lastVisitAt: now,
            visitCount: { increment: 1 },
            totalSpentCents: { increment: totalCents },
          },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CLOSED,
          subtotalCents,
          discountCents,
          loyaltyDiscountCents,
          // A cortesia derruba o resgate junto com a cobrança — o saldo do
          // cliente continua intacto para a próxima visita.
          ...(isCourtesy ? { useLoyalty: false, loyaltyPointsUsed: 0 } : {}),
          totalCents,
          courtesyCents,
          courtesyReason: isCourtesy ? courtesyReason : null,
          closedAt: now,
        },
        include: ORDER_INCLUDE,
      });
    });

    await this.audit.record(
      {
        action: AuditAction.ORDER_CLOSED,
        entity: 'Order',
        entityId: orderId,
        tenantId,
        actorUserId,
        metadata: {
          totalCents: closed.totalCents,
          // O motivo da cortesia é a prova de que o R$ 0 foi decidido, não
          // esquecido — por isso ele vai para o log, sempre.
          ...(isCourtesy
            ? { courtesy: true, courtesyCents: closed.courtesyCents, courtesyReason }
            : {}),
        },
      },
      request,
    );

    return this.toDetail(tenantId, closed);
  }

  /**
   * Cancela uma comanda ABERTA — aberta por engano, cliente que desistiu.
   *
   * Antes disto uma comanda vazia não tinha saída nenhuma: "Fechar comanda"
   * recusa sem itens e não existia outro botão. Ela ficava para sempre na aba
   * "Abertas", contando na contagem do balcão.
   *
   * Só `OPEN` cancela, e é isso que torna a operação barata: comanda aberta
   * não gerou pagamento, movimentação de caixa, comissão nem ponto de
   * fidelidade — não há nada a estornar, ao contrário de `reopen`. Nenhum
   * lançamento financeiro é criado nem desfeito aqui.
   *
   * **O agendamento vinculado não é tocado.** Abrir a comanda nunca mexeu no
   * status dele (concluir é `PATCH /staff-agenda/:id/done`, ação separada
   * desde o agente 31), então cancelar a comanda não tem o que devolver: o
   * agendamento fica exatamente como estava — `CONFIRMED` se era, `DONE` se o
   * balcão já havia concluído o atendimento à parte.
   *
   * `BARBER` cancela a PRÓPRIA comanda (`loadOwned` recorta): é ele quem a
   * abre por engano no meio do atendimento, e mandá-lo procurar o gerente para
   * apagar uma comanda vazia seria fricção sem ganho — não há dinheiro
   * envolvido. Reabrir uma comanda FECHADA, essa sim, continua `MANAGER+`.
   */
  async cancel(
    tenantId: string,
    scope: StaffScope,
    orderId: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<OrderDetail> {
    const order = await this.loadOwned(tenantId, scope, orderId, OrderStatus.OPEN);

    const canceled = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELED, canceledAt: new Date() },
      include: ORDER_INCLUDE,
    });

    await this.audit.record(
      {
        action: AuditAction.ORDER_CANCELED,
        entity: 'Order',
        entityId: orderId,
        tenantId,
        actorUserId,
        metadata: { number: order.number, itemCount: order.items.length },
      },
      request,
    );

    return this.toDetail(tenantId, canceled);
  }

  /**
   * Reabertura — só `MANAGER+` (garantido pelo `@Roles` do controller), sempre
   * auditada, e **em transação única que DESFAZ todos os efeitos do
   * fechamento**.
   *
   * Sem essa reversão, reabrir e fechar de novo contaria tudo duas vezes:
   * estoque baixado 2×, `CommissionEntry` duplicado, `Payment` duplicado,
   * pontos creditados 2×, `visitCount` incrementado 2×, quota de assinatura
   * consumida 2×. Reabrir precisa devolver a comanda ao MESMO estado em que
   * ela estava antes do fechamento — é o par simétrico de `close()`, passo a
   * passo, na ordem inversa.
   */
  async reopen(
    tenantId: string,
    orderId: string,
    dto: ReopenOrderDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<OrderDetail> {
    const existing = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw ApiException.notFound('Comanda não encontrada.');
    }
    if (existing.status !== OrderStatus.CLOSED) {
      throw ApiException.conflict('Só é possível reabrir uma comanda fechada.', 'ORDER_NOT_CLOSED');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true },
      });
      if (order.status !== OrderStatus.CLOSED) {
        throw ApiException.conflict('Só é possível reabrir uma comanda fechada.', 'ORDER_NOT_CLOSED');
      }

      // 1. Devolve o estoque dos produtos vendidos.
      for (const item of order.items) {
        if (item.kind === OrderItemKind.PRODUCT && item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
        // 2. Devolve a quota de assinatura consumida no fechamento.
        if (item.coveredBySubscription && item.subscriptionUsageId) {
          await this.coverage.refund(tx, item.subscriptionUsageId);
        }
      }

      // 3. Apaga as comissões geradas por este fechamento. `PAID` significa
      // período já fechado — aí a comissão virou obrigação com o barbeiro e
      // não pode sumir por uma reabertura de comanda.
      const paidCommission = await tx.commissionEntry.count({
        where: { tenantId, orderId, status: CommissionEntryStatus.PAID },
      });
      if (paidCommission > 0) {
        throw ApiException.conflict(
          'Esta comanda pertence a um período de comissão já fechado e não pode ser reaberta.',
          'COMMISSION_PERIOD_CLOSED',
        );
      }
      await tx.commissionEntry.deleteMany({ where: { tenantId, orderId } });

      // 4. Apaga pagamentos e a movimentação de caixa que eles geraram.
      await tx.cashMovement.deleteMany({ where: { tenantId, orderId } });
      await tx.payment.deleteMany({ where: { tenantId, orderId } });

      // 5. Estorna os pontos de fidelidade (ganhos E resgatados) desta comanda.
      // Apagar as linhas do ledger é o estorno correto aqui: o saldo é a SOMA
      // das linhas, e `orderId` amarra exatamente as que este fechamento criou.
      await tx.loyaltyPoints.deleteMany({ where: { tenantId, orderId } });

      // 6. Desfaz o efeito no perfil do cliente.
      if (order.clientId) {
        const profile = await tx.clientProfile.findUnique({
          where: { tenantId_clientId: { tenantId, clientId: order.clientId } },
          select: { visitCount: true, totalSpentCents: true },
        });
        if (profile) {
          await tx.clientProfile.update({
            where: { tenantId_clientId: { tenantId, clientId: order.clientId } },
            data: {
              visitCount: Math.max(0, profile.visitCount - 1),
              totalSpentCents: Math.max(0, profile.totalSpentCents - order.totalCents),
            },
          });
        }
      }

      // 7. O agendamento volta de DONE para CONFIRMED — o atendimento
      // aconteceu (o cliente esteve lá), só a comanda voltou a ficar aberta.
      if (order.appointmentId) {
        await tx.appointment.update({
          where: { id: order.appointmentId },
          data: { status: AppointmentStatus.CONFIRMED },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.OPEN,
          closedAt: null,
          // 8. Desfaz a cortesia. Sem isto a comanda reaberta voltaria com
          // `totalCents` zero e o motivo antigo colado nela — e fechar de novo
          // por Pix registraria uma venda de R$ 0,00.
          courtesyCents: 0,
          courtesyReason: null,
        },
      });
      // O total foi zerado pela cortesia (ou reduzido pelo resgate que o passo
      // 5 acabou de estornar): recalcular é o que devolve a comanda ao estado
      // de antes do fechamento.
      await this.recompute(tx, orderId);

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    });

    await this.audit.record(
      {
        action: AuditAction.ORDER_REOPENED,
        entity: 'Order',
        entityId: orderId,
        tenantId,
        actorUserId,
        metadata: { reason: dto.reason },
      },
      request,
    );

    return this.toDetail(tenantId, updated);
  }

  // ── Interno ──────────────────────────────────────────────────────────────

  private async loadOwned(
    tenantId: string,
    scope: StaffScope,
    orderId: string,
    requireStatus?: OrderStatus,
  ): Promise<OrderRow> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw ApiException.notFound('Comanda não encontrada.');
    }
    if (scope.forcedBarberId && order.barberId !== scope.forcedBarberId) {
      throw ApiException.forbidden('Você só pode gerenciar as próprias comandas.');
    }
    if (requireStatus && order.status !== requireStatus) {
      throw ApiException.conflict('Esta comanda não está aberta.', 'ORDER_NOT_OPEN');
    }
    return order;
  }

  private async toDetail(tenantId: string, order: OrderRow): Promise<OrderDetail> {
    const [balanceRow, program] = await Promise.all([
      order.clientId
        ? this.prisma.loyaltyPoints.aggregate({
            where: { tenantId, clientId: order.clientId },
            _sum: { points: true },
          })
        : null,
      this.prisma.loyaltyProgram.findUnique({ where: { tenantId } }),
    ]);
    const loyaltyBalance = balanceRow?._sum.points ?? 0;

    return {
      id: order.id,
      number: order.number,
      status: order.status,
      clientId: order.clientId,
      clientName: order.client?.name ?? order.guestName,
      barberId: order.barberId,
      barberName: order.barber?.name ?? null,
      appointmentId: order.appointmentId,
      items: order.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        serviceId: item.serviceId,
        productId: item.productId,
        barberId: item.barberId,
        barberName: item.barber?.name ?? null,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
        coveredBySubscription: item.coveredBySubscription,
      })),
      payments: order.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        amountCents: payment.amountCents,
        paidAt: payment.paidAt?.toISOString() ?? null,
      })),
      subtotalCents: order.subtotalCents,
      discountType: order.discountType,
      discountValue: order.discountValue,
      discountCents: order.discountCents,
      useLoyalty: order.useLoyalty,
      loyaltyPointsUsed: order.loyaltyPointsUsed,
      loyaltyDiscountCents: order.loyaltyDiscountCents,
      loyaltyBalance,
      // Walk-in não acumula ponto: sem `clientId` não há saldo a resgatar, e o
      // card de fidelidade não deve prometer um desconto que não vai existir.
      loyaltyEnabled: Boolean(program?.active) && order.clientId !== null,
      loyaltyPointsRequired: program?.pontosParaDesconto ?? 0,
      loyaltyRewardCents: program?.valorDesconto ?? 0,
      totalCents: order.totalCents,
      paidCents: order.payments.reduce((sum, payment) => sum + payment.amountCents, 0),
      courtesyReason: order.courtesyReason,
      courtesyCents: order.courtesyCents,
      notes: order.notes,
      openedAt: order.openedAt.toISOString(),
      closedAt: order.closedAt?.toISOString() ?? null,
      canceledAt: order.canceledAt?.toISOString() ?? null,
    };
  }
}

function toListItem(order: OrderRow): OrderListItem {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    clientName: order.client?.name ?? order.guestName,
    barberName: order.barber?.name ?? null,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    paymentMethods: order.payments.map((payment) => payment.method),
    // O resumo do card ("2× Corte · 1× Pomada") é montado na tela: quem
    // formata R$ e o "×" é o front, o servidor manda os números.
    lines: order.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
    courtesyReason: order.courtesyReason,
    openedAt: order.openedAt.toISOString(),
    closedAt: order.closedAt?.toISOString() ?? null,
    canceledAt: order.canceledAt?.toISOString() ?? null,
  };
}

/**
 * Rótulo da coluna "Categoria" do extrato de caixa: "Serviço", "Produto" ou
 * "Serviço + Produto", conforme a natureza dos itens da comanda — os mesmos
 * três valores que aparecem em `MOVEMENTS` no protótipo.
 */
function orderCategoryLabel(items: Array<{ kind: OrderItemKind }>): string {
  const hasService = items.some((item) => item.kind === OrderItemKind.SERVICE);
  const hasProduct = items.some((item) => item.kind === OrderItemKind.PRODUCT);
  if (hasService && hasProduct) return 'Serviço + Produto';
  return hasProduct ? 'Produto' : 'Serviço';
}
