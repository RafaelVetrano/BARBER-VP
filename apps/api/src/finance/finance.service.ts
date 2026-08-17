import { Injectable } from '@nestjs/common';
import { AccountStatus, CashMovementType, CashRegisterStatus, Prisma } from '@prisma/client';
import type {
  AccountListQuery,
  AccountPayableItem,
  AccountPayableListResponse,
  AccountReceivableItem,
  AccountReceivableListResponse,
  BankAccountItem,
  CashFlowResponse,
  CashRegisterStatusResponse,
  CloseCashRegisterDto as CloseCashRegisterContract,
  CreateAccountPayableDto as CreateAccountPayableContract,
  CreateAccountReceivableDto as CreateAccountReceivableContract,
  OpenCashRegisterDto as OpenCashRegisterContract,
  UpsertBankAccountDto as UpsertBankAccountContract,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { pageWindow, toPaginated } from '../common/dto/pagination.dto';

const MONTH_LABELS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

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
      include: { movements: { orderBy: { createdAt: 'desc' } }, openedBy: { select: { name: true } } },
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
            createdByUserId: actorUserId,
          },
        },
      },
      include: { movements: true, openedBy: { select: { name: true } } },
    });

    await this.audit.record(
      { action: AuditAction.CASH_REGISTER_OPENED, entity: 'CashRegister', entityId: register.id, tenantId, actorUserId },
      request,
    );

    return { open: true, register: toCashRegisterSummary(register) };
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

    const expectedCents = register.movements.reduce((sum, movement) => sum + movement.amountCents, 0);
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
            createdByUserId: actorUserId,
          },
        },
      },
      include: { movements: { orderBy: { createdAt: 'desc' } }, openedBy: { select: { name: true } } },
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
    const [rows, total] = await Promise.all([
      this.prisma.accountPayable.findMany({
        where,
        include: { bankAccount: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.accountPayable.count({ where }),
    ]);
    return toPaginated(rows.map(toPayableItem), total, window);
  }

  async createPayable(
    tenantId: string,
    dto: CreateAccountPayableContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<AccountPayableItem> {
    const installments = dto.installments ?? 1;
    const created = await this.prisma.accountPayable.create({
      data: {
        tenantId,
        description: dto.description,
        category: dto.category,
        supplier: dto.supplier ?? null,
        amountCents: dto.amountCents,
        dueDate: new Date(`${dto.dueDate}T00:00:00.000Z`),
        installment: 1,
        installments,
        bankAccountId: dto.bankAccountId ?? null,
        notes: dto.notes ?? null,
      },
      include: { bankAccount: { select: { name: true } } },
    });

    await this.audit.record(
      { action: AuditAction.ACCOUNT_PAYABLE_CREATED, entity: 'AccountPayable', entityId: created.id, tenantId, actorUserId },
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
    const existing = await this.prisma.accountPayable.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) {
      throw ApiException.notFound('Conta não encontrada.');
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
    const [rows, total] = await Promise.all([
      this.prisma.accountReceivable.findMany({
        where,
        include: { bankAccount: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.accountReceivable.count({ where }),
    ]);
    return toPaginated(rows.map(toReceivableItem), total, window);
  }

  async createReceivable(
    tenantId: string,
    dto: CreateAccountReceivableContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<AccountReceivableItem> {
    const installments = dto.installments ?? 1;
    const created = await this.prisma.accountReceivable.create({
      data: {
        tenantId,
        description: dto.description,
        category: dto.category,
        customer: dto.customer ?? null,
        amountCents: dto.amountCents,
        dueDate: new Date(`${dto.dueDate}T00:00:00.000Z`),
        installment: 1,
        installments,
        bankAccountId: dto.bankAccountId ?? null,
        notes: dto.notes ?? null,
      },
      include: { bankAccount: { select: { name: true } } },
    });

    await this.audit.record(
      { action: AuditAction.ACCOUNT_RECEIVABLE_CREATED, entity: 'AccountReceivable', entityId: created.id, tenantId, actorUserId },
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
    const existing = await this.prisma.accountReceivable.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) {
      throw ApiException.notFound('Conta não encontrada.');
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

  // ── Contas bancárias ─────────────────────────────────────────────────────

  async listBankAccounts(tenantId: string): Promise<BankAccountItem[]> {
    const rows = await this.prisma.bankAccount.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      bank: row.bank,
      agency: row.agency,
      account: row.account,
      balanceCents: row.balanceCents,
      active: row.active,
    }));
  }

  async upsertBankAccount(
    tenantId: string,
    id: string | undefined,
    dto: UpsertBankAccountContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<BankAccountItem> {
    if (id) {
      const existing = await this.prisma.bankAccount.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) {
        throw ApiException.notFound('Conta bancária não encontrada.');
      }
    }

    const row = id
      ? await this.prisma.bankAccount.update({
          where: { id },
          data: {
            name: dto.name,
            bank: dto.bank ?? null,
            agency: dto.agency ?? null,
            account: dto.account ?? null,
            ...(dto.balanceCents !== undefined ? { balanceCents: dto.balanceCents } : {}),
          },
        })
      : await this.prisma.bankAccount.create({
          data: {
            tenantId,
            name: dto.name,
            bank: dto.bank ?? null,
            agency: dto.agency ?? null,
            account: dto.account ?? null,
            balanceCents: dto.balanceCents ?? 0,
          },
        });

    await this.audit.record(
      { action: AuditAction.BANK_ACCOUNT_UPSERTED, entity: 'BankAccount', entityId: row.id, tenantId, actorUserId },
      request,
    );

    return {
      id: row.id,
      name: row.name,
      bank: row.bank,
      agency: row.agency,
      account: row.account,
      balanceCents: row.balanceCents,
      active: row.active,
    };
  }

  // ── Fluxo de caixa ───────────────────────────────────────────────────────

  async cashFlow(tenantId: string, months = 6): Promise<CashFlowResponse> {
    const now = new Date();
    const windows = Array.from({ length: months }, (_, index) => {
      const offset = months - 1 - index;
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset + 1, 1));
      return { start, end };
    });

    const results = await Promise.all(
      windows.map(async ({ start, end }) => {
        const [payments, payables, receivables] = await Promise.all([
          this.prisma.payment.aggregate({
            where: { tenantId, status: 'PAID', paidAt: { gte: start, lt: end } },
            _sum: { amountCents: true },
          }),
          this.prisma.accountPayable.aggregate({
            where: { tenantId, status: AccountStatus.PAID, paidAt: { gte: start, lt: end } },
            _sum: { amountCents: true },
          }),
          this.prisma.accountReceivable.aggregate({
            where: { tenantId, status: AccountStatus.RECEIVED, receivedAt: { gte: start, lt: end } },
            _sum: { amountCents: true },
          }),
        ]);

        const inCents = (payments._sum.amountCents ?? 0) + (receivables._sum.amountCents ?? 0);
        const outCents = payables._sum.amountCents ?? 0;

        return {
          month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
          label: `${MONTH_LABELS[start.getUTCMonth()]}/${String(start.getUTCFullYear()).slice(2)}`,
          inCents,
          outCents,
          balanceCents: inCents - outCents,
        };
      }),
    );

    return { months: results };
  }
}

// ── Mapeadores ───────────────────────────────────────────────────────────

function toCashRegisterSummary(register: {
  id: string;
  openingCents: number;
  expectedCents: number | null;
  countedCents: number | null;
  differenceCents: number | null;
  openedAt: Date;
  closedAt: Date | null;
  openedBy: { name: string } | null;
  movements: Array<{ id: string; type: CashMovementType; amountCents: number; description: string | null; createdAt: Date }>;
}) {
  return {
    id: register.id,
    openingCents: register.openingCents,
    currentCents: register.movements.reduce((sum, movement) => sum + movement.amountCents, 0),
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
      createdAt: movement.createdAt.toISOString(),
    })),
  };
}

type PayableRow = Prisma.AccountPayableGetPayload<{ include: { bankAccount: { select: { name: true } } } }>;

function effectiveStatus(status: AccountStatus, dueDate: Date, settledStatus: AccountStatus): AccountStatus {
  if (status === AccountStatus.PENDING && dueDate.getTime() < Date.now() && status !== settledStatus) {
    return AccountStatus.OVERDUE;
  }
  return status;
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
    bankAccountId: row.bankAccountId,
    bankAccountName: row.bankAccount?.name ?? null,
    notes: row.notes,
  };
}
