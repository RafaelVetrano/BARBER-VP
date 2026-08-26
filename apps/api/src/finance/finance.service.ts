import { Injectable } from '@nestjs/common';
import {
  AccountRecurrence,
  AccountStatus,
  CashMovementType,
  CashRegisterStatus,
  OrderItemKind,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import type {
  AccountListQuery,
  AccountPayableItem,
  AccountPayableListResponse,
  AccountReceivableItem,
  AccountReceivableListResponse,
  AccountSummary,
  BankAccountItem,
  CashFlowCategoryTotal,
  CashFlowResponse,
  CashRegisterStatusResponse,
  CloseCashRegisterDto as CloseCashRegisterContract,
  CreateAccountPayableDto as CreateAccountPayableContract,
  CreateAccountReceivableDto as CreateAccountReceivableContract,
  CreateCashMovementDto as CreateCashMovementContract,
  OpenCashRegisterDto as OpenCashRegisterContract,
  UpsertBankAccountDto as UpsertBankAccountContract,
} from '@barbervp/types';
import {
  ACCOUNT_RECURRENCE_OCCURRENCES,
  CASH_ENTRY_CATEGORIES,
  CASH_EXIT_CATEGORIES,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { pageWindow, toPaginated } from '../common/dto/pagination.dto';

const MONTH_LABELS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/** As formas que passam pela gaveta — só elas contam na conferência do fechamento. */
const CASH_METHODS: PaymentMethod[] = [PaymentMethod.CASH];

/** Rótulos das categorias agregadas do fluxo de caixa (detalhe do mês expandido). */
const FLOW_CATEGORY_SERVICES = 'Serviços';
const FLOW_CATEGORY_PRODUCTS = 'Produtos';
const FLOW_CATEGORY_SUBSCRIPTIONS = 'Assinaturas';
const FLOW_CATEGORY_RECEIVABLES = 'Contas a receber';
const FLOW_CATEGORY_VALES = 'Vales e adiantamentos';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Caixa ────────────────────────────────────────────────────────────────

  async cashStatus(tenantId: string): Promise<CashRegisterStatusResponse> {
    const register = await this.prisma.cashRegister.findFirst({
      where: { tenantId, status: CashRegisterStatus.OPEN },
      include: { movements: { orderBy: { createdAt: 'asc' } }, openedBy: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
    });

    if (!register) {
      return { open: false, register: null };
    }

    return { open: true, register: toCashRegisterSummary(register) };
  }

  async openCash(
    tenantId: string,
    dto: OpenCashRegisterContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<CashRegisterStatusResponse> {
    const existing = await this.prisma.cashRegister.findFirst({
      where: { tenantId, status: CashRegisterStatus.OPEN },
      select: { id: true },
    });
    if (existing) {
      throw ApiException.conflict('Já existe um caixa aberto.', 'CASH_ALREADY_OPEN');
    }

    const register = await this.prisma.cashRegister.create({
      data: {
        tenantId,
        openedByUserId: actorUserId,
        status: CashRegisterStatus.OPEN,
        openingCents: dto.openingCents,
        movements: {
          create: {
            tenantId,
            type: CashMovementType.OPENING,
            amountCents: dto.openingCents,
            description: 'Abertura do caixa',
            // A abertura é sempre troco em espécie: entra na conferência.
            method: PaymentMethod.CASH,
            category: 'Abertura',
            createdByUserId: actorUserId,
          },
        },
      },
      include: { movements: { orderBy: { createdAt: 'asc' } }, openedBy: { select: { name: true } } },
    });

    await this.audit.record(
      { action: AuditAction.CASH_REGISTER_OPENED, entity: 'CashRegister', entityId: register.id, tenantId, actorUserId },
      request,
    );

    return { open: true, register: toCashRegisterSummary(register) };
  }

  /**
   * "+ Entrada avulsa" / "+ Saída/Sangria" (l.780).
   *
   * O cliente manda sempre valor positivo e a direção à parte; quem inverte o
   * sinal é o servidor — deixar o front mandar negativo abriria a porta para
   * uma "saída" de valor positivo inflar o caixa.
   */
  async createMovement(
    tenantId: string,
    dto: CreateCashMovementContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<CashRegisterStatusResponse> {
    const register = await this.prisma.cashRegister.findFirst({
      where: { tenantId, status: CashRegisterStatus.OPEN },
      select: { id: true, movements: { select: { method: true, amountCents: true } } },
    });
    if (!register) {
      throw ApiException.conflict('Não há caixa aberto.', 'CASH_NOT_OPEN');
    }

    // A categoria pertence a uma direção só: "Sangria" que entra ou "Reforço
    // de caixa" que sai seriam lançamentos sem sentido no extrato do dia.
    const outgoing = dto.direction === 'OUT';
    const allowed: readonly string[] = outgoing ? CASH_EXIT_CATEGORIES : CASH_ENTRY_CATEGORIES;
    if (!allowed.includes(dto.category)) {
      throw ApiException.badRequest(
        `A categoria "${dto.category}" não vale para uma ${outgoing ? 'saída' : 'entrada'}.`,
      );
    }

    // Não se tira da gaveta o que não está nela. Só o dinheiro é limitado: um
    // estorno no cartão sai da conta do adquirente, não do caixa físico.
    if (outgoing && CASH_METHODS.includes(dto.method)) {
      const available = expectedCashOf(register.movements);
      if (dto.amountCents > available) {
        throw ApiException.badRequest(
          `O caixa tem ${formatCents(available)} em dinheiro — não dá para retirar ${formatCents(dto.amountCents)}.`,
        );
      }
    }

    await this.prisma.cashMovement.create({
      data: {
        tenantId,
        cashRegisterId: register.id,
        type: outgoing ? CashMovementType.WITHDRAWAL : CashMovementType.DEPOSIT,
        amountCents: outgoing ? -dto.amountCents : dto.amountCents,
        description: dto.description,
        category: dto.category,
        method: dto.method,
        createdByUserId: actorUserId,
      },
    });

    await this.audit.record(
      {
        action: outgoing ? AuditAction.CASH_WITHDRAWAL : AuditAction.CASH_DEPOSIT,
        entity: 'CashRegister',
        entityId: register.id,
        tenantId,
        actorUserId,
        metadata: { amountCents: dto.amountCents, category: dto.category, method: dto.method },
      },
      request,
    );

    return this.cashStatus(tenantId);
  }

  async closeCash(
    tenantId: string,
    dto: CloseCashRegisterContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<CashRegisterStatusResponse> {
    const register = await this.prisma.cashRegister.findFirst({
      where: { tenantId, status: CashRegisterStatus.OPEN },
      include: { movements: true },
    });
    if (!register) {
      throw ApiException.conflict('Não há caixa aberto.', 'CASH_NOT_OPEN');
    }

    // A conferência é do DINHEIRO: o operador conta a gaveta, e Pix/cartão não
    // estão nela. Somar tudo faria toda barbearia que aceita cartão fechar com
    // uma "quebra" do tamanho das vendas na maquininha.
    const expectedCents = expectedCashOf(register.movements);
    const differenceCents = dto.countedCents - expectedCents;

    const closed = await this.prisma.cashRegister.update({
      where: { id: register.id },
      data: {
        status: CashRegisterStatus.CLOSED,
        expectedCents,
        countedCents: dto.countedCents,
        differenceCents,
        closedAt: new Date(),
        notes: dto.notes ?? null,
        movements: {
          create: {
            tenantId,
            type: CashMovementType.CLOSING,
            amountCents: 0,
            description: `Fechamento — conferido ${(dto.countedCents / 100).toFixed(2)}`,
            category: 'Fechamento',
            createdByUserId: actorUserId,
          },
        },
      },
      include: { movements: { orderBy: { createdAt: 'asc' } }, openedBy: { select: { name: true } } },
    });

    await this.audit.record(
      {
        action: AuditAction.CASH_REGISTER_CLOSED,
        entity: 'CashRegister',
        entityId: closed.id,
        tenantId,
        actorUserId,
        metadata: { expectedCents, countedCents: dto.countedCents, differenceCents },
      },
      request,
    );

    return { open: false, register: toCashRegisterSummary(closed) };
  }

  // ── Contas a pagar ───────────────────────────────────────────────────────

  async listPayable(tenantId: string, query: AccountListQuery): Promise<AccountPayableListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const where: Prisma.AccountPayableWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total, summary] = await Promise.all([
      this.prisma.accountPayable.findMany({
        where,
        include: { bankAccount: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.accountPayable.count({ where }),
      this.accountSummary('AccountPayable', tenantId, AccountStatus.PAID),
    ]);
    return { ...toPaginated(rows.map(toPayableItem), total, window), summary };
  }

  async createPayable(
    tenantId: string,
    dto: CreateAccountPayableContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<AccountPayableItem> {
    const occurrences = planOccurrences(dto.dueDate, dto.installments, dto.recurrence ?? null);
    const seriesId = occurrences.length > 1 ? crypto.randomUUID() : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await Promise.all(
        occurrences.map((occurrence) =>
          tx.accountPayable.create({
            data: {
              tenantId,
              description: dto.description,
              category: dto.category,
              supplier: dto.supplier ?? null,
              amountCents: dto.amountCents,
              dueDate: occurrence.dueDate,
              installment: occurrence.installment,
              installments: occurrence.installments,
              seriesId,
              recurrence: (dto.recurrence as AccountRecurrence | null) ?? null,
              bankAccountId: dto.bankAccountId ?? null,
              notes: dto.notes ?? null,
            },
            include: { bankAccount: { select: { name: true } } },
          }),
        ),
      );
      return rows[0]!;
    });

    await this.audit.record(
      {
        action: AuditAction.ACCOUNT_PAYABLE_CREATED,
        entity: 'AccountPayable',
        entityId: created.id,
        tenantId,
        actorUserId,
        metadata: { occurrences: occurrences.length, seriesId, recurrence: dto.recurrence ?? null },
      },
      request,
    );

    return toPayableItem(created);
  }

  async markPayablePaid(
    tenantId: string,
    id: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<AccountPayableItem> {
    const existing = await this.prisma.accountPayable.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw ApiException.notFound('Conta não encontrada.');
    }
    if (existing.status === AccountStatus.PAID) {
      throw ApiException.conflict('Esta conta já está paga.', 'ACCOUNT_ALREADY_SETTLED');
    }

    const updated = await this.prisma.accountPayable.update({
      where: { id },
      data: { status: AccountStatus.PAID, paidAt: new Date() },
      include: { bankAccount: { select: { name: true } } },
    });

    await this.audit.record(
      { action: AuditAction.ACCOUNT_PAYABLE_PAID, entity: 'AccountPayable', entityId: id, tenantId, actorUserId },
      request,
    );

    return toPayableItem(updated);
  }

  // ── Contas a receber ─────────────────────────────────────────────────────

  async listReceivable(tenantId: string, query: AccountListQuery): Promise<AccountReceivableListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const where: Prisma.AccountReceivableWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total, summary] = await Promise.all([
      this.prisma.accountReceivable.findMany({
        where,
        include: { bankAccount: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.accountReceivable.count({ where }),
      this.accountSummary('AccountReceivable', tenantId, AccountStatus.RECEIVED),
    ]);
    return { ...toPaginated(rows.map(toReceivableItem), total, window), summary };
  }

  async createReceivable(
    tenantId: string,
    dto: CreateAccountReceivableContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<AccountReceivableItem> {
    const occurrences = planOccurrences(dto.dueDate, dto.installments, dto.recurrence ?? null);
    const seriesId = occurrences.length > 1 ? crypto.randomUUID() : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await Promise.all(
        occurrences.map((occurrence) =>
          tx.accountReceivable.create({
            data: {
              tenantId,
              description: dto.description,
              category: dto.category,
              customer: dto.customer ?? null,
              amountCents: dto.amountCents,
              dueDate: occurrence.dueDate,
              installment: occurrence.installment,
              installments: occurrence.installments,
              seriesId,
              recurrence: (dto.recurrence as AccountRecurrence | null) ?? null,
              bankAccountId: dto.bankAccountId ?? null,
              notes: dto.notes ?? null,
            },
            include: { bankAccount: { select: { name: true } } },
          }),
        ),
      );
      return rows[0]!;
    });

    await this.audit.record(
      {
        action: AuditAction.ACCOUNT_RECEIVABLE_CREATED,
        entity: 'AccountReceivable',
        entityId: created.id,
        tenantId,
        actorUserId,
        metadata: { occurrences: occurrences.length, seriesId, recurrence: dto.recurrence ?? null },
      },
      request,
    );

    return toReceivableItem(created);
  }

  async markReceivableReceived(
    tenantId: string,
    id: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<AccountReceivableItem> {
    const existing = await this.prisma.accountReceivable.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw ApiException.notFound('Conta não encontrada.');
    }
    if (existing.status === AccountStatus.RECEIVED) {
      throw ApiException.conflict('Esta conta já está recebida.', 'ACCOUNT_ALREADY_SETTLED');
    }

    const updated = await this.prisma.accountReceivable.update({
      where: { id },
      data: { status: AccountStatus.RECEIVED, receivedAt: new Date() },
      include: { bankAccount: { select: { name: true } } },
    });

    await this.audit.record(
      { action: AuditAction.ACCOUNT_RECEIVABLE_RECEIVED, entity: 'AccountReceivable', entityId: id, tenantId, actorUserId },
      request,
    );

    return toReceivableItem(updated);
  }

  /**
   * Os 3 KPIs do topo (Vencidas · Vence em 7 dias · Total do mês), somados no
   * banco. São recortes do conjunto INTEIRO, não da página — calcular no
   * cliente daria o total dos 50 itens visíveis, que é outro número.
   */
  private async accountSummary(
    table: 'AccountPayable' | 'AccountReceivable',
    tenantId: string,
    settledStatus: AccountStatus,
  ): Promise<AccountSummary> {
    const today = startOfUtcDay(new Date());
    const in7Days = addUtcDays(today, 8); // exclusivo: hoje + 7 dias inteiros
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));

    const rows = await this.prisma.$queryRaw<Array<{ overdue: bigint; next7: bigint; month: bigint }>>`
      SELECT
        COALESCE(SUM("amountCents") FILTER (
          WHERE "status" NOT IN (${settledStatus}::"AccountStatus", ${AccountStatus.CANCELED}::"AccountStatus")
            AND "dueDate" < ${today}
        ), 0) AS overdue,
        COALESCE(SUM("amountCents") FILTER (
          WHERE "status" NOT IN (${settledStatus}::"AccountStatus", ${AccountStatus.CANCELED}::"AccountStatus")
            AND "dueDate" >= ${today} AND "dueDate" < ${in7Days}
        ), 0) AS next7,
        COALESCE(SUM("amountCents") FILTER (
          WHERE "status" <> ${AccountStatus.CANCELED}::"AccountStatus"
            AND "dueDate" >= ${monthStart} AND "dueDate" < ${monthEnd}
        ), 0) AS month
      FROM ${Prisma.raw(`"${table}"`)}
      WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
    `;

    const row = rows[0];
    return {
      overdueCents: Number(row?.overdue ?? 0),
      next7DaysCents: Number(row?.next7 ?? 0),
      monthCents: Number(row?.month ?? 0),
    };
  }

  // ── Contas bancárias ─────────────────────────────────────────────────────

  async listBankAccounts(tenantId: string): Promise<BankAccountItem[]> {
    const rows = await this.prisma.bankAccount.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map(toBankAccountItem);
  }

  async upsertBankAccount(
    tenantId: string,
    id: string | undefined,
    dto: UpsertBankAccountContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<BankAccountItem> {
    if (id) {
      const existing = await this.prisma.bankAccount.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) {
        throw ApiException.notFound('Conta bancária não encontrada.');
      }
    }

    // `@@unique([tenantId, name])` no schema: o nome é o rótulo do card e o do
    // seletor "Conta de saída/entrada" — dois iguais deixariam a tela ambígua.
    const duplicate = await this.prisma.bankAccount.findFirst({
      where: { tenantId, name: dto.name, deletedAt: null, ...(id ? { NOT: { id } } : {}) },
      select: { id: true },
    });
    if (duplicate) {
      throw ApiException.conflict('Já existe uma conta com este nome.', 'BANK_ACCOUNT_NAME_TAKEN');
    }

    const shared = {
      name: dto.name,
      type: dto.type ?? null,
      bank: dto.bank ?? null,
      agency: dto.agency ?? null,
      account: dto.account ?? null,
      ...(dto.acceptedMethods ? { acceptedMethods: dto.acceptedMethods as PaymentMethod[] } : {}),
    };

    const row = id
      ? await this.prisma.bankAccount.update({
          where: { id },
          data: {
            ...shared,
            ...(dto.balanceCents !== undefined ? { balanceCents: dto.balanceCents } : {}),
          },
        })
      : await this.prisma.bankAccount.create({
          data: { tenantId, ...shared, balanceCents: dto.balanceCents ?? 0 },
        });

    await this.audit.record(
      { action: AuditAction.BANK_ACCOUNT_UPSERTED, entity: 'BankAccount', entityId: row.id, tenantId, actorUserId },
      request,
    );

    return toBankAccountItem(row);
  }

  // ── Fluxo de caixa ───────────────────────────────────────────────────────

  /**
   * Entradas × saídas dos últimos N meses, com o detalhe por categoria de cada
   * mês e o saldo acumulado da janela.
   *
   * Tudo agregado em SQL, num `GROUP BY` por mês: o laço anterior fazia
   * `3 × N` consultas e ainda assim não tinha como abrir as categorias.
   */
  async cashFlow(tenantId: string, months = 6): Promise<CashFlowResponse> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const [sales, subscriptions, receivables, payables, vales] = await Promise.all([
      // Entradas de comanda, separadas por natureza do item. O rateio é pelo
      // peso do item no subtotal da comanda: um pagamento não vem etiquetado
      // como "serviço" ou "produto", mas os itens que ele quitou vêm. Sem o
      // rateio, uma comanda de corte + pomada jogaria tudo numa categoria só.
      this.prisma.$queryRaw<Array<{ bucket: string; kind: OrderItemKind; total: bigint }>>`
        WITH kind_total AS (
          SELECT "orderId", "kind", SUM("totalCents")::numeric AS cents
          FROM "OrderItem"
          WHERE "tenantId" = ${tenantId}
          GROUP BY "orderId", "kind"
        ),
        order_total AS (
          SELECT "orderId", SUM(cents) AS cents FROM kind_total GROUP BY "orderId"
        ),
        paid AS (
          SELECT
            "orderId",
            to_char(date_trunc('month', "paidAt" AT TIME ZONE 'UTC'), 'YYYY-MM') AS bucket,
            SUM("amountCents")::numeric AS cents
          FROM "Payment"
          WHERE "tenantId" = ${tenantId}
            AND "status" = 'PAID'
            AND "deletedAt" IS NULL
            AND "orderId" IS NOT NULL
            AND "paidAt" >= ${start} AND "paidAt" < ${end}
          GROUP BY "orderId", bucket
        )
        SELECT
          paid.bucket AS bucket,
          kind_total."kind" AS kind,
          COALESCE(SUM(paid.cents * kind_total.cents / NULLIF(order_total.cents, 0)), 0)::bigint AS total
        FROM paid
        JOIN kind_total  ON kind_total."orderId"  = paid."orderId"
        JOIN order_total ON order_total."orderId" = paid."orderId"
        GROUP BY paid.bucket, kind_total."kind"
      `,
      // Assinaturas — pagamento avulso de plano, que não tem comanda nem item.
      this.prisma.$queryRaw<Array<{ bucket: string; total: bigint }>>`
        SELECT
          to_char(date_trunc('month', "paidAt" AT TIME ZONE 'UTC'), 'YYYY-MM') AS bucket,
          COALESCE(SUM("amountCents"), 0)::bigint AS total
        FROM "Payment"
        WHERE "tenantId" = ${tenantId}
          AND "status" = 'PAID'
          AND "deletedAt" IS NULL
          AND "orderId" IS NULL
          AND "paidAt" >= ${start} AND "paidAt" < ${end}
        GROUP BY bucket
      `,
      this.prisma.$queryRaw<Array<{ bucket: string; total: bigint }>>`
        SELECT
          to_char(date_trunc('month', "receivedAt" AT TIME ZONE 'UTC'), 'YYYY-MM') AS bucket,
          COALESCE(SUM("amountCents"), 0)::bigint AS total
        FROM "AccountReceivable"
        WHERE "tenantId" = ${tenantId}
          AND "status" = 'RECEIVED'
          AND "deletedAt" IS NULL
          AND "receivedAt" >= ${start} AND "receivedAt" < ${end}
        GROUP BY bucket
      `,
      this.prisma.$queryRaw<Array<{ bucket: string; category: string; total: bigint }>>`
        SELECT
          to_char(date_trunc('month', "paidAt" AT TIME ZONE 'UTC'), 'YYYY-MM') AS bucket,
          "category" AS category,
          COALESCE(SUM("amountCents"), 0)::bigint AS total
        FROM "AccountPayable"
        WHERE "tenantId" = ${tenantId}
          AND "status" = 'PAID'
          AND "deletedAt" IS NULL
          AND "paidAt" >= ${start} AND "paidAt" < ${end}
        GROUP BY bucket, "category"
      `,
      this.prisma.$queryRaw<Array<{ bucket: string; total: bigint }>>`
        SELECT
          to_char(date_trunc('month', "settledAt" AT TIME ZONE 'UTC'), 'YYYY-MM') AS bucket,
          COALESCE(SUM("amountCents"), 0)::bigint AS total
        FROM "Vale"
        WHERE "tenantId" = ${tenantId}
          AND "settledAt" IS NOT NULL
          AND "settledAt" >= ${start} AND "settledAt" < ${end}
        GROUP BY bucket
      `,
    ]);

    const inflow = new Map<string, Map<string, number>>();
    const outflow = new Map<string, Map<string, number>>();
    const bump = (map: Map<string, Map<string, number>>, bucket: string, name: string, cents: number) => {
      if (cents === 0) return;
      const inner = map.get(bucket) ?? new Map<string, number>();
      inner.set(name, (inner.get(name) ?? 0) + cents);
      map.set(bucket, inner);
    };

    for (const row of sales) {
      const label = row.kind === OrderItemKind.PRODUCT ? FLOW_CATEGORY_PRODUCTS : FLOW_CATEGORY_SERVICES;
      bump(inflow, row.bucket, label, Number(row.total));
    }
    for (const row of subscriptions) bump(inflow, row.bucket, FLOW_CATEGORY_SUBSCRIPTIONS, Number(row.total));
    for (const row of receivables) bump(inflow, row.bucket, FLOW_CATEGORY_RECEIVABLES, Number(row.total));
    for (const row of payables) bump(outflow, row.bucket, row.category, Number(row.total));
    for (const row of vales) bump(outflow, row.bucket, FLOW_CATEGORY_VALES, Number(row.total));

    let accumulated = 0;
    return {
      months: Array.from({ length: months }, (_, index) => {
        const monthStart = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - index), 1),
        );
        const bucket = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`;
        const inflowByCategory = sortCategories(inflow.get(bucket));
        const outflowByCategory = sortCategories(outflow.get(bucket));
        const inCents = inflowByCategory.reduce((sum, item) => sum + item.amountCents, 0);
        const outCents = outflowByCategory.reduce((sum, item) => sum + item.amountCents, 0);
        accumulated += inCents - outCents;

        return {
          month: bucket,
          label: `${MONTH_LABELS[monthStart.getUTCMonth()]}/${String(monthStart.getUTCFullYear()).slice(2)}`,
          inCents,
          outCents,
          balanceCents: inCents - outCents,
          accumulatedCents: accumulated,
          inflowByCategory,
          outflowByCategory,
        };
      }),
    };
  }
}

// ── Mapeadores ───────────────────────────────────────────────────────────

function sortCategories(map: Map<string, number> | undefined): CashFlowCategoryTotal[] {
  if (!map) return [];
  return [...map.entries()]
    .map(([name, amountCents]) => ({ name, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

/** `R$ 150,00` para as mensagens de erro — o front nunca reformata o motivo. */
function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

interface PlannedOccurrence {
  dueDate: Date;
  installment: number;
  installments: number;
}

/**
 * Quantas linhas uma conta vira e com que vencimento.
 *
 * Parcelado e recorrente são excludentes na tela (dois toggles, mas o
 * parcelamento é o que tem número de parcelas); quando os dois vêm ligados o
 * parcelamento manda, porque é ele que define quantas linhas existem.
 */
function planOccurrences(
  firstDueDate: string,
  installments: number | undefined,
  recurrence: AccountRecurrence | string | null,
): PlannedOccurrence[] {
  const first = new Date(`${firstDueDate}T00:00:00.000Z`);
  const count = installments && installments > 1 ? installments : 1;

  if (count > 1) {
    return Array.from({ length: count }, (_, index) => ({
      dueDate: addMonths(first, index),
      installment: index + 1,
      installments: count,
    }));
  }

  if (recurrence) {
    return Array.from({ length: ACCOUNT_RECURRENCE_OCCURRENCES }, (_, index) => ({
      dueDate: advance(first, recurrence as AccountRecurrence, index),
      installment: 1,
      installments: 1,
    }));
  }

  return [{ dueDate: first, installment: 1, installments: 1 }];
}

/**
 * Soma meses preservando o dia — 31/01 + 1 mês vira 28/02 (ou 29), nunca 03/03.
 * `setUTCMonth` sozinho transborda, e uma conta de aluguel do dia 31 pularia de
 * mês em fevereiro.
 */
function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function advance(date: Date, recurrence: AccountRecurrence, steps: number): Date {
  if (recurrence === AccountRecurrence.WEEKLY) return addUtcDays(date, steps * 7);
  if (recurrence === AccountRecurrence.YEARLY) return addMonths(date, steps * 12);
  return addMonths(date, steps);
}

type MovementRow = {
  id: string;
  type: CashMovementType;
  amountCents: number;
  description: string | null;
  method: PaymentMethod | null;
  category: string | null;
  createdAt: Date;
};

/** Saldo esperado na gaveta: só o que passou por ela, com sinal. */
function expectedCashOf(movements: Array<Pick<MovementRow, 'method' | 'amountCents'>>): number {
  return movements
    .filter((movement) => movement.method !== null && CASH_METHODS.includes(movement.method))
    .reduce((sum, movement) => sum + movement.amountCents, 0);
}

function toCashRegisterSummary(register: {
  id: string;
  openingCents: number;
  expectedCents: number | null;
  countedCents: number | null;
  differenceCents: number | null;
  openedAt: Date;
  closedAt: Date | null;
  openedBy: { name: string } | null;
  movements: MovementRow[];
}) {
  // A abertura entra em `openingCents`, não em "Entradas" — no protótipo os
  // dois KPIs são independentes e o saldo atual soma os dois.
  const flow = register.movements.filter((movement) => movement.type !== CashMovementType.OPENING);
  const entriesCents = flow.reduce((sum, m) => (m.amountCents > 0 ? sum + m.amountCents : sum), 0);
  const exitsCents = flow.reduce((sum, m) => (m.amountCents < 0 ? sum - m.amountCents : sum), 0);

  // "Resumo por forma de pagamento" do fechamento é o que ENTROU por cada
  // forma, não o líquido: uma sangria de R$ 50 não torna a linha "Dinheiro"
  // negativa — ela aparece nas Saídas e no extrato, e já está descontada do
  // `expectedCashCents`, que é o número contra o qual a gaveta é conferida.
  const byMethod = new Map<PaymentMethod, number>();
  for (const movement of flow) {
    if (!movement.method || movement.amountCents <= 0) continue;
    byMethod.set(movement.method, (byMethod.get(movement.method) ?? 0) + movement.amountCents);
  }

  return {
    id: register.id,
    openingCents: register.openingCents,
    currentCents: register.openingCents + entriesCents - exitsCents,
    entriesCents,
    exitsCents,
    expectedCashCents: expectedCashOf(register.movements),
    byMethod: [...byMethod.entries()].map(([method, amountCents]) => ({ method, amountCents })),
    expectedCents: register.expectedCents,
    countedCents: register.countedCents,
    differenceCents: register.differenceCents,
    openedAt: register.openedAt.toISOString(),
    closedAt: register.closedAt?.toISOString() ?? null,
    openedByName: register.openedBy?.name ?? null,
    movements: register.movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amountCents: movement.amountCents,
      description: movement.description,
      method: movement.method,
      category: movement.category,
      createdAt: movement.createdAt.toISOString(),
    })),
  };
}

type PayableRow = Prisma.AccountPayableGetPayload<{ include: { bankAccount: { select: { name: true } } } }>;

/**
 * `OVERDUE` é derivado, não gravado: uma conta pendente vira vencida sozinha
 * quando o dia passa, e um job noturno para reescrever a coluna seria estado
 * duplicado que pode ficar defasado. `dueDate` é `@db.Date` (meia-noite UTC),
 * então a comparação é contra a meia-noite UTC de hoje.
 */
function effectiveStatus(status: AccountStatus, dueDate: Date, settledStatus: AccountStatus): AccountStatus {
  if (status === settledStatus || status === AccountStatus.CANCELED) return status;
  return dueDate < startOfUtcDay(new Date()) ? AccountStatus.OVERDUE : status;
}

function toPayableItem(row: PayableRow): AccountPayableItem {
  return {
    id: row.id,
    description: row.description,
    category: row.category,
    supplier: row.supplier,
    amountCents: row.amountCents,
    dueDate: row.dueDate.toISOString().slice(0, 10),
    paidAt: row.paidAt?.toISOString() ?? null,
    status: effectiveStatus(row.status, row.dueDate, AccountStatus.PAID),
    installment: row.installment,
    installments: row.installments,
    recurrence: row.recurrence,
    bankAccountId: row.bankAccountId,
    bankAccountName: row.bankAccount?.name ?? null,
    notes: row.notes,
  };
}

type ReceivableRow = Prisma.AccountReceivableGetPayload<{ include: { bankAccount: { select: { name: true } } } }>;

function toReceivableItem(row: ReceivableRow): AccountReceivableItem {
  return {
    id: row.id,
    description: row.description,
    category: row.category,
    customer: row.customer,
    amountCents: row.amountCents,
    dueDate: row.dueDate.toISOString().slice(0, 10),
    receivedAt: row.receivedAt?.toISOString() ?? null,
    status: effectiveStatus(row.status, row.dueDate, AccountStatus.RECEIVED),
    installment: row.installment,
    installments: row.installments,
    recurrence: row.recurrence,
    bankAccountId: row.bankAccountId,
    bankAccountName: row.bankAccount?.name ?? null,
    notes: row.notes,
  };
}

function toBankAccountItem(row: {
  id: string;
  name: string;
  type: string | null;
  bank: string | null;
  agency: string | null;
  account: string | null;
  acceptedMethods: PaymentMethod[];
  balanceCents: number;
  active: boolean;
}): BankAccountItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    bank: row.bank,
    agency: row.agency,
    account: row.account,
    acceptedMethods: row.acceptedMethods,
    balanceCents: row.balanceCents,
    active: row.active,
  };
}
