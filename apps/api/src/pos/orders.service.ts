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
  OrderListItem,
  OrderListQuery,
  OrderListResponse,
  PosCatalogResponse,
} from '@barbervp/types';
import { applyPercentDiscount } from '@barbervp/types';
import { PrismaService, type PrismaTransaction } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { pageWindow, toPaginated } from '../common/dto/pagination.dto';
import type { StaffScope } from '../staff-agenda/staff-scope.service';
import { SubscriptionCoverageService } from '../booking/subscription-coverage.service';
import { CommissionCalcService, monthStart } from '../commissions/commission-calc.service';
import type {
  AddOrderItemDto,
  ApplyOrderDiscountDto,
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
    const [services, products, barbers] = await Promise.all([
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
    };
  }

  // ── Listagem/detalhe ─────────────────────────────────────────────────────

  async list(tenantId: string, scope: StaffScope, query: OrderListQuery): Promise<OrderListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const where: Prisma.OrderWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(scope.forcedBarberId ? { barberId: scope.forcedBarberId } : query.barberId ? { barberId: query.barberId } : {}),
      ...(query.search
        ? {
            OR: [
              { client: { name: { contains: query.search, mode: 'insensitive' } } },
              { guestName: { contains: query.search, mode: 'insensitive' } },
              { number: Number.isNaN(Number(query.search)) ? undefined : Number(query.search) },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { openedAt: 'desc' },
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return toPaginated(rows.map(toListItem), total, window);
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

    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: { id: dto.appointmentId, tenantId },
        select: { id: true, barberId: true, clientId: true, guestName: true, order: { select: { id: true } } },
      });
      if (!appointment) {
        throw ApiException.notFound('Agendamento não encontrado.');
      }
      if (appointment.order) {
        throw ApiException.conflict('Este agendamento já tem uma comanda aberta.', 'ORDER_ALREADY_EXISTS');
      }
      barberId = barberId ?? appointment.barberId;
      clientId = clientId ?? appointment.clientId;
      guestName = guestName ?? appointment.guestName;
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

    await this.audit.record(
      { action: AuditAction.ORDER_OPENED, entity: 'Order', entityId: order.id, tenantId, actorUserId },
      request,
    );

    return this.toDetail(tenantId, order);
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
        },
      });

      if (order.status !== OrderStatus.OPEN) {
        throw ApiException.conflict('Esta comanda não está aberta.', 'ORDER_NOT_OPEN');
      }
      if (order.items.length === 0) {
        throw ApiException.badRequest('Adicione ao menos um item antes de fechar a comanda.');
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

      let discountCents = 0;
      if (order.discountType === DiscountType.PERCENT) {
        discountCents = subtotalCents - applyPercentDiscount(subtotalCents, order.discountValue);
      } else if (order.discountType === DiscountType.FIXED) {
        discountCents = Math.min(order.discountValue, subtotalCents);
      }
      const loyaltyDiscountCents = Math.min(order.loyaltyDiscountCents, subtotalCents - discountCents);
      const totalCents = Math.max(0, subtotalCents - discountCents - loyaltyDiscountCents);

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

      // Comissão por item de SERVIÇO com barbeiro atribuído.
      for (const item of order.items) {
        if (item.kind === OrderItemKind.SERVICE && item.barberId) {
          await this.commissionCalc.recordServiceEntry(tx, {
            tenantId,
            barberId: item.barberId,
            orderId,
            orderItemId: item.id,
            baseCents: item.totalCents,
            referenceMonth,
          });
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

      // Caixa — vendas em dinheiro entram no registro aberto, se houver.
      const cashAmount = dto.payments
        .filter((payment) => payment.method === PaymentMethod.CASH)
        .reduce((sum, payment) => sum + payment.amountCents, 0);
      if (cashAmount > 0) {
        const register = await tx.cashRegister.findFirst({
          where: { tenantId, status: CashRegisterStatus.OPEN },
          select: { id: true },
        });
        if (register) {
          await tx.cashMovement.create({
            data: {
              tenantId,
              cashRegisterId: register.id,
              type: CashMovementType.SALE,
              amountCents: cashAmount,
              description: `Comanda #${order.number}`,
              orderId,
              createdByUserId: actorUserId,
            },
          });
        }
      }

      // Marca o agendamento vinculado como concluído.
      if (order.appointmentId) {
        await tx.appointment.update({
          where: { id: order.appointmentId },
          data: { status: AppointmentStatus.DONE },
        });
      }

      // Pontos de fidelidade — `Math.round(subtotal / gastoPorPonto)`.
      if (order.clientId) {
        const program = await tx.loyaltyProgram.findUnique({ where: { tenantId } });
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
          totalCents,
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
        metadata: { totalCents: closed.totalCents },
      },
      request,
    );

    return this.toDetail(tenantId, closed);
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

      return tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.OPEN, closedAt: null },
        include: ORDER_INCLUDE,
      });
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
    let loyaltyBalance = 0;
    if (order.clientId) {
      const sum = await this.prisma.loyaltyPoints.aggregate({
        where: { tenantId, clientId: order.clientId },
        _sum: { points: true },
      });
      loyaltyBalance = sum._sum.points ?? 0;
    }

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
      totalCents: order.totalCents,
      paidCents: order.payments.reduce((sum, payment) => sum + payment.amountCents, 0),
      notes: order.notes,
      openedAt: order.openedAt.toISOString(),
      closedAt: order.closedAt?.toISOString() ?? null,
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
    totalCents: order.totalCents,
    paymentMethods: order.payments.map((payment) => payment.method),
    openedAt: order.openedAt.toISOString(),
    closedAt: order.closedAt?.toISOString() ?? null,
  };
}
