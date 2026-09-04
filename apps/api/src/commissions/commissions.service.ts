import { Injectable } from '@nestjs/common';
import { CommissionEntryKind, CommissionEntryStatus, Prisma } from '@prisma/client';
import type {
  ClosePeriodDto as ClosePeriodContract,
  CommissionBarberSummary,
  CommissionExtractEntry,
  CommissionPeriodQuery,
  CommissionPeriodResponse,
  CommissionPeriodType,
  CommissionRuleItem,
  CreateValeDto as CreateValeContract,
  UpsertCommissionRuleDto as UpsertCommissionRuleContract,
  ValeItem,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import type { StaffScope } from '../staff-agenda/staff-scope.service';
import { pickTierPercent } from './commission-calc.service';

/** Recorte resolvido de `type` + `anchor` — `end` é EXCLUSIVO. */
interface PeriodRange {
  type: CommissionPeriodType;
  start: Date;
  end: Date;
  /** Competência (`YYYY-MM`) que "Fechar período" trava. */
  month: string;
  referenceMonth: Date;
}

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Regras ───────────────────────────────────────────────────────────────

  async listRules(tenantId: string): Promise<CommissionRuleItem[]> {
    const rules = await this.prisma.commissionRule.findMany({
      where: { tenantId },
      include: { tiers: { orderBy: { sortOrder: 'asc' } }, barbers: { select: { id: true } } },
      orderBy: { name: 'asc' },
    });
    return rules.map(toRuleItem);
  }

  async upsertRule(
    tenantId: string,
    id: string | undefined,
    dto: UpsertCommissionRuleContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<CommissionRuleItem> {
    const barberIds = dto.barberIds ?? [];
    if (barberIds.length > 0) {
      const count = await this.prisma.barber.count({ where: { id: { in: barberIds }, tenantId } });
      if (count !== barberIds.length) {
        throw ApiException.badRequest('Um ou mais barbeiros não pertencem a esta barbearia.');
      }
    }

    if (id) {
      const existing = await this.prisma.commissionRule.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) {
        throw ApiException.notFound('Regra de comissão não encontrada.');
      }
    }

    const tiers = dto.type === 'TIERED' ? normalizeTiers(dto.tiers ?? []) : [];
    const percentProdutosBps = dto.percentProdutosBps ?? 0;
    if (percentProdutosBps < 0 || percentProdutosBps > 10_000) {
      throw ApiException.badRequest('O percentual de produtos precisa ficar entre 0% e 100%.');
    }

    const rule = await this.prisma.$transaction(async (tx) => {
      const data = {
        name: dto.name,
        type: dto.type,
        percentBps: dto.type === 'FIXED' ? (dto.percentBps ?? 0) : null,
        percentProdutosBps,
        deductVales: dto.deductVales ?? true,
      };

      const saved = id
        ? await tx.commissionRule.update({
            where: { id },
            data: { ...data, tiers: { deleteMany: {} } },
          })
        : await tx.commissionRule.create({ data: { tenantId, ...data } });

      if (tiers.length > 0) {
        await tx.commissionTier.createMany({
          data: tiers.map((tier, index) => ({
            tenantId,
            ruleId: saved.id,
            upToCents: tier.upToCents,
            percentBps: tier.percentBps,
            sortOrder: index,
          })),
        });
      }

      await tx.barber.updateMany({
        where: { tenantId, commissionRuleId: saved.id },
        data: { commissionRuleId: null },
      });
      if (barberIds.length > 0) {
        await tx.barber.updateMany({
          where: { tenantId, id: { in: barberIds } },
          data: { commissionRuleId: saved.id },
        });
      }

      return saved;
    });

    await this.audit.record(
      {
        action: AuditAction.COMMISSION_RULE_UPSERTED,
        entity: 'CommissionRule',
        entityId: rule.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    const full = await this.prisma.commissionRule.findUniqueOrThrow({
      where: { id: rule.id },
      include: { tiers: { orderBy: { sortOrder: 'asc' } }, barbers: { select: { id: true } } },
    });
    return toRuleItem(full);
  }

  // ── Extrato do período ──────────────────────────────────────────────────

  /**
   * Extrato do recorte pedido — "Semanal" ou "Mensal" do protótipo
   * (`Dashboard.dc.html` l.1096).
   *
   * O recorte é só de LEITURA. A competência continua sendo o mês: é sobre o
   * faturamento mensal que a faixa da regra é escolhida (SPEC: até R$5.000 →
   * 40%…) e é o mês que `closePeriod` trava. Uma semana isolada escolheria uma
   * faixa mais baixa e pagaria a menos.
   */
  async period(
    tenantId: string,
    query: CommissionPeriodQuery,
    scope: StaffScope,
  ): Promise<CommissionPeriodResponse> {
    const range = resolveRange(query);

    const barbers = await this.prisma.barber.findMany({
      where: {
        tenantId,
        active: true,
        ...(scope.forcedBarberId ? { id: scope.forcedBarberId } : {}),
      },
      select: {
        id: true,
        name: true,
        commissionRule: {
          select: {
            id: true,
            name: true,
            type: true,
            percentBps: true,
            percentProdutosBps: true,
            deductVales: true,
            tiers: { select: { upToCents: true, percentBps: true, sortOrder: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const summaries: CommissionBarberSummary[] = [];
    // O período só está fechado quando TODO barbeiro com lançamento está
    // fechado. Com `some`, um barbeiro fechado marcaria o mês inteiro como
    // fechado e o botão "Fechar período" sumiria da tela — deixando os demais
    // travados em PENDING para sempre.
    let allClosed = true;
    let anyEntry = false;

    for (const barber of barbers) {
      const entries = await this.prisma.commissionEntry.findMany({
        where: {
          tenantId,
          barberId: barber.id,
          // Pelo fechamento da COMANDA, e não por `createdAt`: é a data que a
          // tela mostra na coluna "Data" e a única que sobrevive a um seed com
          // histórico retroativo.
          order: { closedAt: { gte: range.start, lt: range.end } },
        },
        include: {
          order: { select: { closedAt: true, client: { select: { name: true } }, guestName: true } },
          orderItem: { select: { description: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Faturamento bruto do barbeiro no recorte — a base das duas primeiras
      // colunas da tabela. Vem do `OrderItem` e não dos lançamentos: item sem
      // comissão (barbeiro sem regra, produto a 0%) continua sendo faturamento.
      const faturado = await this.prisma.orderItem.groupBy({
        by: ['kind'],
        where: {
          tenantId,
          barberId: barber.id,
          order: { status: 'CLOSED', closedAt: { gte: range.start, lt: range.end } },
        },
        _sum: { totalCents: true },
      });
      const faturadoDe = (kind: 'SERVICE' | 'PRODUCT') =>
        faturado.find((row) => row.kind === kind)?._sum.totalCents ?? 0;

      // Vale filtrado pelo DIA do adiantamento (`Vale.date`), que é o que
      // fecha tanto no mês quanto na semana. Vale já quitado continua na
      // conta: some-lo depois do fechamento faria o período fechado exibir um
      // total MAIOR do que o que foi efetivamente pago.
      const vales = await this.prisma.vale.aggregate({
        where: { tenantId, barberId: barber.id, date: { gte: range.start, lt: range.end } },
        _sum: { amountCents: true },
      });

      const servicos = entries.filter((entry) => entry.kind === CommissionEntryKind.SERVICE);
      const produtos = entries.filter((entry) => entry.kind === CommissionEntryKind.PRODUCT);
      const comissaoServicosCents = sumBy(servicos, (entry) => entry.amountCents);
      const comissaoProdutosCents = sumBy(produtos, (entry) => entry.amountCents);
      const comissaoCents = comissaoServicosCents + comissaoProdutosCents;

      const deductVales = barber.commissionRule?.deductVales ?? true;
      const valeCents = vales._sum.amountCents ?? 0;

      const closed = entries.length > 0 && entries.every((entry) => entry.status === CommissionEntryStatus.PAID);
      if (entries.length > 0) {
        anyEntry = true;
        allClosed = allClosed && closed;
      }

      summaries.push({
        barberId: barber.id,
        barberName: barber.name,
        ruleId: barber.commissionRule?.id ?? null,
        ruleName: barber.commissionRule?.name ?? null,
        ruleType: barber.commissionRule?.type ?? null,
        // A taxa que a tela mostra no chip é a que os lançamentos de SERVIÇO
        // realmente usaram — não a nominal da regra. Num mês que cruzou a
        // faixa antes de fechar, as duas divergem, e quem paga é a primeira.
        appliedPercentBps: servicos.at(-1)?.percentBps ?? barber.commissionRule?.percentBps ?? null,
        ruleProdutosPercentBps: barber.commissionRule?.percentProdutosBps ?? 0,
        deductVales,
        faturadoServicosCents: faturadoDe('SERVICE'),
        faturadoProdutosCents: faturadoDe('PRODUCT'),
        comissaoServicosCents,
        comissaoProdutosCents,
        comissaoCents,
        valeCents,
        totalCents: deductVales ? Math.max(0, comissaoCents - valeCents) : comissaoCents,
        atendimentos: servicos.length,
        status: closed ? 'PAID' : 'PENDING',
        extrato: entries.map(toExtractEntry),
      });
    }

    return {
      type: range.type,
      month: range.month,
      start: isoDay(range.start),
      end: isoDay(new Date(range.end.getTime() - 86_400_000)),
      closed: anyEntry ? allClosed : false,
      totalAPagarCents: sumBy(summaries, (summary) => summary.totalCents),
      scoped: scope.forcedBarberId !== null,
      barbers: summaries,
    };
  }

  /** "Fechar período" — recalcula a taxa definitiva pelo faturamento TOTAL do mês e trava (`status: PAID`). */
  async closePeriod(
    tenantId: string,
    dto: ClosePeriodContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<CommissionPeriodResponse> {
    const referenceMonth = parseMonth(dto.month);

    const barbers = await this.prisma.barber.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        commissionRule: {
          select: {
            type: true,
            percentBps: true,
            deductVales: true,
            tiers: { select: { upToCents: true, percentBps: true, sortOrder: true } },
          },
        },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      for (const barber of barbers) {
        const entries = await tx.commissionEntry.findMany({
          where: { tenantId, barberId: barber.id, referenceMonth, status: CommissionEntryStatus.PENDING },
        });
        if (entries.length === 0) {
          continue;
        }

        // Só o faturamento de SERVIÇO escolhe a faixa — produto tem percentual
        // único e já nasceu definitivo, então sua taxa não é recalculada.
        const servicos = entries.filter((entry) => entry.kind === CommissionEntryKind.SERVICE);
        const totalBaseCents = sumBy(servicos, (entry) => entry.baseCents);
        const finalPercentBps = barber.commissionRule
          ? pickTierPercent(barber.commissionRule, totalBaseCents)
          : 0;

        for (const entry of servicos) {
          await tx.commissionEntry.update({
            where: { id: entry.id },
            data: {
              percentBps: finalPercentBps,
              amountCents: Math.round((entry.baseCents * finalPercentBps) / 10_000),
              status: CommissionEntryStatus.PAID,
              paidAt: new Date(),
            },
          });
        }

        await tx.commissionEntry.updateMany({
          where: { id: { in: entries.filter((e) => e.kind === CommissionEntryKind.PRODUCT).map((e) => e.id) } },
          data: { status: CommissionEntryStatus.PAID, paidAt: new Date() },
        });

        // Vale só é quitado quando a regra desconta. Com o toggle desligado o
        // adiantamento não entrou no total pago — dar baixa nele aqui apagaria
        // uma dívida que ninguém cobrou.
        if (barber.commissionRule?.deductVales ?? true) {
          await tx.vale.updateMany({
            where: { tenantId, barberId: barber.id, referenceMonth, settledAt: null },
            data: { settledAt: new Date() },
          });
        }
      }
    });

    await this.audit.record(
      {
        action: AuditAction.COMMISSION_PERIOD_CLOSED,
        entity: 'CommissionEntry',
        tenantId,
        actorUserId,
        metadata: { month: dto.month },
      },
      request,
    );

    return this.period(tenantId, { type: 'MONTHLY', month: dto.month }, { forcedBarberId: null });
  }

  // ── Vales ────────────────────────────────────────────────────────────────

  async listVales(tenantId: string, scope: StaffScope): Promise<ValeItem[]> {
    const vales = await this.prisma.vale.findMany({
      where: { tenantId, ...(scope.forcedBarberId ? { barberId: scope.forcedBarberId } : {}) },
      include: { barber: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return vales.map(toValeItem);
  }

  async createVale(
    tenantId: string,
    dto: CreateValeContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ValeItem> {
    const barber = await this.prisma.barber.findFirst({
      where: { id: dto.barberId, tenantId },
      select: { id: true, name: true },
    });
    if (!barber) {
      throw ApiException.notFound('Barbeiro não encontrado.');
    }

    const date = new Date(`${dto.date}T00:00:00.000Z`);
    const referenceMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

    const vale = await this.prisma.vale.create({
      data: {
        tenantId,
        barberId: dto.barberId,
        amountCents: dto.amountCents,
        date,
        referenceMonth,
        description: dto.description ?? null,
      },
      include: { barber: { select: { name: true } } },
    });

    await this.audit.record(
      {
        action: AuditAction.VALE_CREATED,
        entity: 'Vale',
        entityId: vale.id,
        tenantId,
        actorUserId,
        metadata: { barberId: dto.barberId, amountCents: dto.amountCents },
      },
      request,
    );

    return toValeItem(vale);
  }
}

// ── Período ────────────────────────────────────────────────────────────────

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + pick(row), 0);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseMonth(month: string): Date {
  const [year, mm] = month.split('-').map(Number);
  if (!year || !mm || mm < 1 || mm > 12) {
    throw ApiException.badRequest('Mês inválido — use o formato YYYY-MM.');
  }
  return new Date(Date.UTC(year, mm - 1, 1));
}

function parseDay(day: string): Date {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiException.badRequest('Data inválida — use o formato YYYY-MM-DD.');
  }
  return parsed;
}

/** Segunda-feira da semana do dia informado (UTC) — a semana brasileira. */
function weekStart(day: Date): Date {
  const start = new Date(day);
  const weekday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - weekday);
  return start;
}

function resolveRange(query: CommissionPeriodQuery): PeriodRange {
  const type: CommissionPeriodType = query.type ?? 'MONTHLY';

  if (type === 'WEEKLY') {
    const anchor = query.anchor ? parseDay(query.anchor) : parseDay(isoDay(new Date()));
    const start = weekStart(anchor);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    // A competência é a do DIA ÂNCORA, não a do começo da semana: numa semana
    // que atravessa a virada do mês, é o dia escolhido no stepper que diz de
    // qual fechamento aquela leitura faz parte.
    const referenceMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    return { type, start, end, month: isoDay(referenceMonth).slice(0, 7), referenceMonth };
  }

  const referenceMonth = query.month
    ? parseMonth(query.month)
    : (() => {
        const anchor = query.anchor ? parseDay(query.anchor) : new Date();
        return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
      })();
  const end = new Date(Date.UTC(referenceMonth.getUTCFullYear(), referenceMonth.getUTCMonth() + 1, 1));
  return { type, start: referenceMonth, end, month: isoDay(referenceMonth).slice(0, 7), referenceMonth };
}

/**
 * Faixas em ordem crescente, com a ÚLTIMA sempre aberta (`upToCents: null`).
 * O editor do protótipo desenha a última linha como "Acima de R$ …" e trava o
 * campo; garantir isso aqui evita uma regra sem teto que deixaria o
 * faturamento acima da maior faixa sem percentual nenhum.
 */
function normalizeTiers(
  tiers: Array<{ upToCents: number | null; percentBps: number }>,
): Array<{ upToCents: number | null; percentBps: number }> {
  const bounded = tiers
    .filter((tier) => tier.upToCents !== null)
    .sort((a, b) => (a.upToCents ?? 0) - (b.upToCents ?? 0));
  const open = tiers.find((tier) => tier.upToCents === null) ?? tiers.at(-1);
  if (!open) {
    return [];
  }
  const last = bounded.at(-1);
  const openTier = { upToCents: null, percentBps: open.percentBps };
  return last && last === open ? [...bounded.slice(0, -1), openTier] : [...bounded, openTier];
}

// ── Serialização ───────────────────────────────────────────────────────────

type EntryRow = Prisma.CommissionEntryGetPayload<{
  include: {
    order: { select: { closedAt: true; client: { select: { name: true } }; guestName: true } };
    orderItem: { select: { description: true } };
  };
}>;

function toExtractEntry(entry: EntryRow): CommissionExtractEntry {
  return {
    date: (entry.order?.closedAt ?? entry.createdAt).toISOString(),
    clientName: entry.order?.client?.name ?? entry.order?.guestName ?? 'Cliente avulso',
    itemName: entry.orderItem?.description ?? '—',
    kind: entry.kind,
    baseCents: entry.baseCents,
    percentBps: entry.percentBps,
    commissionCents: entry.amountCents,
  };
}

type RuleRow = Prisma.CommissionRuleGetPayload<{
  include: { tiers: true; barbers: { select: { id: true } } };
}>;

function toRuleItem(rule: RuleRow): CommissionRuleItem {
  return {
    id: rule.id,
    name: rule.name,
    type: rule.type,
    percentBps: rule.percentBps,
    tiers: rule.tiers
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((tier) => ({ upToCents: tier.upToCents, percentBps: tier.percentBps })),
    percentProdutosBps: rule.percentProdutosBps,
    deductVales: rule.deductVales,
    active: rule.active,
    barberIds: rule.barbers.map((barber) => barber.id),
  };
}

function toValeItem(vale: {
  id: string;
  barberId: string;
  amountCents: number;
  date: Date;
  referenceMonth: Date;
  description: string | null;
  settledAt: Date | null;
  barber: { name: string };
}): ValeItem {
  return {
    id: vale.id,
    barberId: vale.barberId,
    barberName: vale.barber.name,
    amountCents: vale.amountCents,
    date: vale.date.toISOString().slice(0, 10),
    referenceMonth: vale.referenceMonth.toISOString().slice(0, 7),
    description: vale.description,
    settled: vale.settledAt !== null,
  };
}
