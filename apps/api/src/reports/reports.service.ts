import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CourtesySummary,
  HeatmapRow,
  NoShowMonthPoint,
  PaymentDistributionEntry,
  ReportPeriodQuery,
  ReportRevenuePoint,
  ReportsAdvancedResponse,
  ReportsHeatmap,
  ReportsSummaryResponse,
  ReturnRate,
  ReturnRateBucket,
  RevenueByBarber,
  RevenueByService,
  TicketByBarber,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import type { StaffScope } from '../staff-agenda/staff-scope.service';
import { deltaPct } from '../dashboard/dashboard-window';
import { zonedTimeToUtc } from '../common/utils/timezone';
import { previousWindow, resolveWindow, type ResolvedWindow } from './reports-period';

/** As 14 colunas do heatmap do protótipo (`HOURS`, l.6871): 8h…21h. */
const HEATMAP_HOURS = Array.from({ length: 14 }, (_, index) => index + 8);
/** Linhas do heatmap na ordem do protótipo — segunda primeiro, domingo por último. */
const HEATMAP_DAYS = [
  { weekday: 1, short: 'Seg', full: 'segunda-feira' },
  { weekday: 2, short: 'Ter', full: 'terça-feira' },
  { weekday: 3, short: 'Qua', full: 'quarta-feira' },
  { weekday: 4, short: 'Qui', full: 'quinta-feira' },
  { weekday: 5, short: 'Sex', full: 'sexta-feira' },
  { weekday: 6, short: 'Sáb', full: 'sábado' },
  { weekday: 0, short: 'Dom', full: 'domingo' },
];
const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Faixas de "Taxa de retorno" do protótipo (`retencaoBuckets`, l.6884). */
const RETURN_BUCKETS = [
  { label: '0–15 dias', max: 15 },
  { label: '16–30 dias', max: 30 },
  { label: '31–45 dias', max: 45 },
  { label: '46+ dias / não voltou', max: Number.POSITIVE_INFINITY },
];
/** O "45" de "dos clientes voltam em até 45 dias". */
const RETURN_HEADLINE_DAYS = 45;

/** Meses do gráfico "Taxa de faltas por mês" (`faltasMesesLabels`, l.6893). */
const NO_SHOW_MONTHS = 8;

/** Expediente presumido quando a barbearia não cadastrou horários. */
const FALLBACK_OPEN_HOUR = 8;
const FALLBACK_CLOSE_HOUR = 22;

interface ReportContext {
  tenantId: string;
  timeZone: string;
  window: ResolvedWindow;
  /** Filtro efetivo de barbeiros — `null` = todos. */
  barberIds: string[] | null;
  unitId: string | null;
  scoped: boolean;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Os três blocos SEM cadeado do protótipo: faturamento por período (com o
   * delta contra a janela anterior), por barbeiro e por forma de pagamento.
   */
  async summary(
    tenantId: string,
    query: ReportPeriodQuery,
    scope: StaffScope,
  ): Promise<ReportsSummaryResponse> {
    const context = await this.contextOf(tenantId, query, scope);
    const { window } = context;
    const previous = previousWindow(window, context.timeZone);

    const [current, previousAgg, series, byBarber, payments, courtesies] = await Promise.all([
      this.revenueTotals(context, window.start, window.end),
      this.revenueTotals(context, previous.start, previous.end),
      this.revenueSeries(context),
      this.revenueByBarber(context),
      this.paymentDistribution(context),
      this.courtesies(context),
    ]);

    return {
      period: { key: window.key, from: window.from, to: window.to },
      scoped: context.scoped,
      revenueCents: current.revenueCents,
      previousRevenueCents: previousAgg.revenueCents,
      deltaPct: deltaPct(current.revenueCents, previousAgg.revenueCents),
      orders: current.orders,
      averageTicketCents:
        current.orders > 0 ? Math.round(current.revenueCents / current.orders) : 0,
      revenueSeries: series,
      revenueByBarber: byBarber,
      paymentDistribution: payments,
      courtesies,
    };
  }

  /** Os cinco blocos COM cadeado — o gate é do controller, aqui só se agrega. */
  async advanced(
    tenantId: string,
    query: ReportPeriodQuery,
    scope: StaffScope,
  ): Promise<ReportsAdvancedResponse> {
    const context = await this.contextOf(tenantId, query, scope);

    const [byService, returnRate, heatmap, noShowTrend, byBarber] = await Promise.all([
      this.revenueByService(context),
      this.returnRate(context),
      this.heatmap(context),
      this.noShowTrend(context),
      this.revenueByBarber(context),
    ]);

    return {
      period: { key: context.window.key, from: context.window.from, to: context.window.to },
      scoped: context.scoped,
      revenueByService: byService,
      returnRate,
      heatmap,
      noShowTrend,
      ticketByBarber: byBarber.map(toTicket),
    };
  }

  // ── Contexto ───────────────────────────────────────────────────────────

  /**
   * O papel `BARBER` NÃO escolhe barbeiro: o filtro dele é o próprio id, venha
   * o que vier na query. É a mesma regra do extrato de comissão — quem decide
   * o recorte é o servidor, nunca o parâmetro.
   */
  private async contextOf(
    tenantId: string,
    query: ReportPeriodQuery,
    scope: StaffScope,
  ): Promise<ReportContext> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });

    const requested = query.barberIds?.filter(Boolean) ?? [];
    const barberIds = scope.forcedBarberId
      ? [scope.forcedBarberId]
      : requested.length > 0
        ? requested
        : null;

    return {
      tenantId,
      timeZone: tenant.timezone,
      window: resolveWindow(query, tenant.timezone),
      barberIds,
      unitId: query.unitId ?? null,
      scoped: scope.forcedBarberId !== null,
    };
  }

  /** `AND o."barberId" IN (…) AND o."unitId" = …` — vazio quando não há filtro. */
  private orderFilter(context: ReportContext, alias = 'o'): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (context.barberIds) {
      parts.push(
        Prisma.sql`AND ${Prisma.raw(`"${alias}"."barberId"`)} IN (${Prisma.join(context.barberIds)})`,
      );
    }
    if (context.unitId) {
      parts.push(Prisma.sql`AND ${Prisma.raw(`"${alias}"."unitId"`)} = ${context.unitId}`);
    }
    return parts.length > 0 ? Prisma.join(parts, ' ') : Prisma.empty;
  }

  // ── Blocos abertos ─────────────────────────────────────────────────────

  /**
   * Faturamento e ATENDIMENTOS do intervalo.
   *
   * O card "Atendimentos" contava comandas fechadas. Desde o agente 31
   * concluir um atendimento e cobrar por ele são ações INDEPENDENTES: quem
   * clica "Concluir" na Agenda e não abre comanda tem um atendimento real, com
   * faturamento zero — e ele sumia do relatório inteiro. A conta agora soma os
   * dois conjuntos, sem interseção possível: comandas fechadas no período MAIS
   * agendamentos `DONE` que não têm comanda nenhuma.
   *
   * `revenueCents` não muda: um atendimento sem comanda não faturou nada. O
   * ticket médio cai quando existem atendimentos assim, e é o número certo —
   * a casa atendeu mais gente pelo mesmo dinheiro.
   *
   * O agendamento é recortado por `startsAt` (quando o atendimento aconteceu),
   * que é o análogo do `closedAt` da comanda; e pelo `barberId`/`unitId` dele
   * próprio, não pelos da comanda — daí o `appointmentFilter` separado.
   */
  private async revenueTotals(
    context: ReportContext,
    start: Date,
    end: Date,
  ): Promise<{ revenueCents: number; orders: number }> {
    const [orderRows, appointmentRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ revenueCents: bigint; orders: bigint }>>`
        SELECT COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents",
               COUNT(o.id)::bigint AS "orders"
        FROM "Order" o
        WHERE o."tenantId" = ${context.tenantId}
          AND o.status = 'CLOSED'
          AND o."closedAt" >= ${start} AND o."closedAt" < ${end}
          ${this.orderFilter(context)}
      `,
      this.prisma.$queryRaw<Array<{ appointments: bigint }>>`
        SELECT COUNT(a.id)::bigint AS "appointments"
        FROM "Appointment" a
        -- Sem comanda FECHADA: a comanda ainda aberta não faturou nada e não
        -- entrou na conta acima, então o atendimento tem de aparecer por aqui
        -- — senão ele some da tela justamente enquanto o cliente ainda está no
        -- balcão.
        LEFT JOIN "Order" o
          ON o."appointmentId" = a.id AND o."deletedAt" IS NULL AND o.status = 'CLOSED'
        WHERE a."tenantId" = ${context.tenantId}
          AND a.status = 'DONE'
          AND a."startsAt" >= ${start} AND a."startsAt" < ${end}
          AND o.id IS NULL
          ${this.appointmentFilter(context)}
      `,
    ]);
    const row = orderRows[0];
    return {
      revenueCents: Number(row?.revenueCents ?? 0),
      orders: Number(row?.orders ?? 0) + Number(appointmentRows[0]?.appointments ?? 0),
    };
  }

  /** O mesmo recorte de barbeiro/unidade do `orderFilter`, sobre `Appointment`. */
  private appointmentFilter(context: ReportContext): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (context.barberIds) {
      parts.push(Prisma.sql`AND a."barberId" IN (${Prisma.join(context.barberIds)})`);
    }
    if (context.unitId) {
      parts.push(Prisma.sql`AND a."unitId" = ${context.unitId}`);
    }
    return parts.length > 0 ? Prisma.join(parts, ' ') : Prisma.empty;
  }

  /**
   * Cortesias do período (agente 31): quantas comandas fecharam sem cobrar e o
   * que elas teriam valido A PREÇO DE TABELA.
   *
   * O valor NÃO sai de `Order.courtesyCents`: aquele número é o que a comanda
   * cobraria depois de desconto e de cobertura de assinatura, e uma comanda
   * inteiramente coberta por assinatura fechada como cortesia valeria zero ali
   * — dizendo que a casa deu R$ 0,00 de graça num corte de R$ 45,00. O preço
   * de tabela vem do catálogo, item a item, que é a pergunta que o dono faz.
   */
  private async courtesies(context: ReportContext): Promise<CourtesySummary> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint; listPriceCents: bigint }>>`
      WITH courtesy AS (
        SELECT o.id
        FROM "Order" o
        WHERE o."tenantId" = ${context.tenantId}
          AND o.status = 'CLOSED'
          AND o."courtesyReason" IS NOT NULL
          AND o."closedAt" >= ${context.window.start} AND o."closedAt" < ${context.window.end}
          ${this.orderFilter(context)}
      )
      SELECT (SELECT COUNT(*) FROM courtesy)::bigint AS "count",
             COALESCE(SUM(COALESCE(s."priceCents", p."priceCents", oi."unitPriceCents") * oi.quantity), 0)::bigint
               AS "listPriceCents"
      FROM "OrderItem" oi
      JOIN courtesy c ON c.id = oi."orderId"
      LEFT JOIN "Service" s ON s.id = oi."serviceId"
      LEFT JOIN "Product" p ON p.id = oi."productId"
    `;
    const row = rows[0];
    return {
      count: Number(row?.count ?? 0),
      listPriceCents: Number(row?.listPriceCents ?? 0),
    };
  }

  /**
   * A série do gráfico de área. "Hoje" é por HORA (o protótipo rotula
   * `08h…22h`); os demais recortes são por DIA, um ponto por dia do intervalo
   * — inclusive os dias sem faturamento, senão a linha encurtaria e mentiria
   * sobre a inclinação.
   */
  private async revenueSeries(context: ReportContext): Promise<ReportRevenuePoint[]> {
    const { window, timeZone } = context;

    if (window.key === 'hoje') {
      const rows = await this.prisma.$queryRaw<Array<{ bucket: number; revenueCents: bigint }>>`
        SELECT EXTRACT(HOUR FROM (o."closedAt" AT TIME ZONE ${timeZone}))::int AS "bucket",
               COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents"
        FROM "Order" o
        WHERE o."tenantId" = ${context.tenantId}
          AND o.status = 'CLOSED'
          AND o."closedAt" >= ${window.start} AND o."closedAt" < ${window.end}
          ${this.orderFilter(context)}
        GROUP BY 1
      `;
      const byHour = new Map(rows.map((row) => [row.bucket, Number(row.revenueCents)]));
      const hours = await this.openHours(context.tenantId);
      return hours.map((hour) => ({
        label: `${String(hour).padStart(2, '0')}h`,
        revenueCents: byHour.get(hour) ?? 0,
      }));
    }

    const rows = await this.prisma.$queryRaw<Array<{ bucket: Date; revenueCents: bigint }>>`
      SELECT date_trunc('day', o."closedAt" AT TIME ZONE ${timeZone}) AS "bucket",
             COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents"
      FROM "Order" o
      WHERE o."tenantId" = ${context.tenantId}
        AND o.status = 'CLOSED'
        AND o."closedAt" >= ${window.start} AND o."closedAt" < ${window.end}
        ${this.orderFilter(context)}
      GROUP BY 1
    `;
    // `date_trunc` sobre um `timestamp` (já sem fuso) volta como Date em UTC —
    // ler com `getUTC*` devolve exatamente o dia local que agrupamos.
    const byDay = new Map(rows.map((row) => [isoOf(row.bucket), Number(row.revenueCents)]));

    return eachDay(window.from, window.to).map((day) => ({
      label: labelFor(day, window.key),
      revenueCents: byDay.get(day) ?? 0,
    }));
  }

  /**
   * Faturamento por barbeiro.
   *
   * **`LEFT JOIN`, e não `JOIN`.** Comanda sem barbeiro — a venda de balcão,
   * o walk-in atendido por quem estava livre — ficava de fora do
   * detalhamento, e a soma das linhas NÃO batia com o card de faturamento
   * logo acima: dois números na mesma tela, discordando, sem nada explicando
   * a diferença. Agora essas comandas aparecem numa linha "Sem barbeiro" e a
   * soma fecha.
   *
   * O que continua fora, e é decisão de produto e não defeito: o faturamento
   * é atribuído ao barbeiro PRINCIPAL da comanda (`Order.barberId`), sem
   * rateio por item. Comanda com serviços de dois profissionais conta inteira
   * para um só.
   */
  private async revenueByBarber(context: ReportContext): Promise<RevenueByBarber[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ barberId: string | null; barberName: string | null; revenueCents: bigint; orders: bigint }>
    >`
      SELECT b.id AS "barberId", b.name AS "barberName",
             COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents",
             COUNT(o.id)::bigint AS "orders"
      FROM "Order" o
      LEFT JOIN "Barber" b ON b.id = o."barberId"
      WHERE o."tenantId" = ${context.tenantId}
        AND o.status = 'CLOSED'
        AND o."closedAt" >= ${context.window.start} AND o."closedAt" < ${context.window.end}
        ${this.orderFilter(context)}
      GROUP BY b.id, b.name
      ORDER BY "revenueCents" DESC, b.name ASC
    `;
    return rows.map((row) => ({
      // `null` é a linha das comandas sem barbeiro; o id vazio a distingue de
      // um profissional real sem quebrar a chave da lista na tela.
      barberId: row.barberId ?? '',
      barberName: row.barberName ?? 'Sem barbeiro',
      revenueCents: Number(row.revenueCents),
      orders: Number(row.orders),
    }));
  }

  /**
   * A rosca reparte EXATAMENTE o faturamento mostrado acima dela: os pagamentos
   * entram pela comanda (`JOIN "Order"`) e pela data de FECHAMENTO dela, não
   * por `paidAt`. Somar por `paidAt` faria a legenda dar 100% de um total que
   * não é o do card — e um pagamento de assinatura, que não tem comanda,
   * apareceria numa fatia que o "Faturamento por período" não contou.
   */
  private async paymentDistribution(context: ReportContext): Promise<PaymentDistributionEntry[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ method: string; amountCents: bigint; count: bigint }>
    >`
      SELECT p.method::text AS "method",
             COALESCE(SUM(p."amountCents"), 0)::bigint AS "amountCents",
             COUNT(p.id)::bigint AS "count"
      FROM "Payment" p
      JOIN "Order" o ON o.id = p."orderId"
      WHERE p."tenantId" = ${context.tenantId}
        AND p.status = 'PAID'
        AND p."deletedAt" IS NULL
        -- COURTESY é sempre R$ 0: entraria aqui como uma fatia de 0% num
        -- gráfico que reparte FATURAMENTO. As cortesias têm o recorte próprio
        -- do bloco courtesies(), com o número que interessa.
        AND p.method <> 'COURTESY'
        AND o.status = 'CLOSED'
        AND o."closedAt" >= ${context.window.start} AND o."closedAt" < ${context.window.end}
        ${this.orderFilter(context)}
      GROUP BY p.method
      ORDER BY "amountCents" DESC
    `;

    const total = rows.reduce((sum, row) => sum + Number(row.amountCents), 0);
    return rows.map((row) => ({
      method: row.method,
      amountCents: Number(row.amountCents),
      count: Number(row.count),
      pct: total > 0 ? Math.round((Number(row.amountCents) / total) * 100) : 0,
    }));
  }

  // ── Blocos com cadeado ─────────────────────────────────────────────────

  private async revenueByService(context: ReportContext): Promise<RevenueByService[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ serviceId: string; serviceName: string; revenueCents: bigint; count: bigint }>
    >`
      SELECT s.id AS "serviceId", s.name AS "serviceName",
             COALESCE(SUM(oi."totalCents"), 0)::bigint AS "revenueCents",
             COUNT(oi.id)::bigint AS "count"
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Service" s ON s.id = oi."serviceId"
      WHERE oi."tenantId" = ${context.tenantId}
        AND oi.kind = 'SERVICE'
        AND o.status = 'CLOSED'
        AND o."closedAt" >= ${context.window.start} AND o."closedAt" < ${context.window.end}
        ${this.orderFilter(context)}
      GROUP BY s.id, s.name
      ORDER BY "revenueCents" DESC, s.name ASC
    `;
    return rows.map((row) => ({
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      revenueCents: Number(row.revenueCents),
      count: Number(row.count),
    }));
  }

  /**
   * "Taxa de retorno": há quantos dias cada cliente da barbearia foi visto pela
   * última vez, contados a partir do FIM do período — não de `NOW()`. Olhando
   * um mês fechado do ano passado, `NOW()` jogaria a base inteira em "46+
   * dias" e o bloco diria que ninguém volta.
   *
   * O filtro de barbeiros usa `favoriteBarberId`: retorno é uma propriedade do
   * cliente, e é o barbeiro preferido dele que a Clientes já registra.
   */
  private async returnRate(context: ReportContext): Promise<ReturnRate> {
    const barberFilter = context.barberIds
      ? Prisma.sql`AND cp."favoriteBarberId" IN (${Prisma.join(context.barberIds)})`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{ daysSince: number; clients: bigint }>>`
      SELECT GREATEST(
               0,
               FLOOR(EXTRACT(EPOCH FROM (${context.window.end} - cp."lastVisitAt")) / 86400)
             )::int AS "daysSince",
             COUNT(*)::bigint AS "clients"
      FROM "ClientProfile" cp
      WHERE cp."tenantId" = ${context.tenantId}
        AND cp."deletedAt" IS NULL
        AND cp."lastVisitAt" IS NOT NULL
        AND cp."lastVisitAt" < ${context.window.end}
        ${barberFilter}
      GROUP BY 1
    `;

    const buckets: ReturnRateBucket[] = RETURN_BUCKETS.map((bucket) => ({
      label: bucket.label,
      clients: 0,
      pct: 0,
    }));
    let clients = 0;
    let within = 0;

    for (const row of rows) {
      const count = Number(row.clients);
      clients += count;
      if (row.daysSince <= RETURN_HEADLINE_DAYS) {
        within += count;
      }
      const index = RETURN_BUCKETS.findIndex((bucket) => row.daysSince <= bucket.max);
      const bucket = buckets[index === -1 ? buckets.length - 1 : index];
      if (bucket) {
        bucket.clients += count;
      }
    }

    for (const bucket of buckets) {
      bucket.pct = clients > 0 ? Math.round((bucket.clients / clients) * 100) : 0;
    }

    return {
      clients,
      withinDays: RETURN_HEADLINE_DAYS,
      headlinePct: clients > 0 ? Math.round((within / clients) * 100) : 0,
      buckets,
    };
  }

  /** Heatmap de horários de pico — dia da semana × hora, no fuso da barbearia. */
  private async heatmap(context: ReportContext): Promise<ReportsHeatmap> {
    const barberFilter = context.barberIds
      ? Prisma.sql`AND a."barberId" IN (${Prisma.join(context.barberIds)})`
      : Prisma.empty;
    const unitFilter = context.unitId
      ? Prisma.sql`AND a."unitId" = ${context.unitId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{ weekday: number; hour: number; appointments: bigint }>
    >`
      SELECT EXTRACT(DOW FROM (a."startsAt" AT TIME ZONE ${context.timeZone}))::int AS "weekday",
             EXTRACT(HOUR FROM (a."startsAt" AT TIME ZONE ${context.timeZone}))::int AS "hour",
             COUNT(a.id)::bigint AS "appointments"
      FROM "Appointment" a
      WHERE a."tenantId" = ${context.tenantId}
        AND a.status IN ('DONE', 'CONFIRMED')
        AND a."startsAt" >= ${context.window.start} AND a."startsAt" < ${context.window.end}
        ${barberFilter}
        ${unitFilter}
      GROUP BY 1, 2
    `;

    const counts = new Map(rows.map((row) => [`${row.weekday}-${row.hour}`, Number(row.appointments)]));
    const max = Math.max(0, ...counts.values());

    const heatmapRows: HeatmapRow[] = HEATMAP_DAYS.map((day) => ({
      day: day.short,
      weekday: day.weekday,
      cells: HEATMAP_HOURS.map((hour) => {
        const appointments = counts.get(`${day.weekday}-${hour}`) ?? 0;
        return { hour, appointments, intensity: max > 0 ? appointments / max : 0 };
      }),
    }));

    return { hours: HEATMAP_HOURS, rows: heatmapRows, peakLabel: peakLabelOf(heatmapRows, max) };
  }

  /**
   * "Taxa de faltas por mês": 8 meses terminando no mês final do período — é um
   * bloco de TENDÊNCIA, e não do recorte escolhido nas pílulas. Um relatório de
   * "Hoje" com um único ponto não mostraria queda nenhuma.
   */
  private async noShowTrend(context: ReportContext): Promise<{
    points: NoShowMonthPoint[];
    whatsappActivatedIndex: number | null;
  }> {
    const months = lastMonths(context.window.to, NO_SHOW_MONTHS);
    const firstMonthStart = monthStartUtc(months[0] as string, context.timeZone);
    const lastMonthEnd = monthStartUtc(nextMonth(months[months.length - 1] as string), context.timeZone);

    const barberFilter = context.barberIds
      ? Prisma.sql`AND a."barberId" IN (${Prisma.join(context.barberIds)})`
      : Prisma.empty;
    const unitFilter = context.unitId
      ? Prisma.sql`AND a."unitId" = ${context.unitId}`
      : Prisma.empty;

    const [rows, reminder] = await Promise.all([
      this.prisma.$queryRaw<Array<{ bucket: Date; appointments: bigint; noShows: bigint }>>`
        SELECT date_trunc('month', a."startsAt" AT TIME ZONE ${context.timeZone}) AS "bucket",
               COUNT(a.id)::bigint AS "appointments",
               COUNT(a.id) FILTER (WHERE a.status = 'NO_SHOW')::bigint AS "noShows"
        FROM "Appointment" a
        WHERE a."tenantId" = ${context.tenantId}
          AND a.status IN ('DONE', 'NO_SHOW')
          AND a."startsAt" >= ${firstMonthStart} AND a."startsAt" < ${lastMonthEnd}
          ${barberFilter}
          ${unitFilter}
        GROUP BY 1
      `,
      this.prisma.whatsappAutomationConfig.findUnique({
        where: { tenantId_event: { tenantId: context.tenantId, event: 'REMINDER' } },
        select: { enabledAt: true },
      }),
    ]);

    const byMonth = new Map(
      rows.map((row) => [
        isoOf(row.bucket).slice(0, 7),
        { appointments: Number(row.appointments), noShows: Number(row.noShows) },
      ]),
    );

    const points: NoShowMonthPoint[] = months.map((month) => {
      const entry = byMonth.get(month) ?? { appointments: 0, noShows: 0 };
      return {
        month,
        label: MONTH_SHORT[Number(month.slice(5, 7)) - 1] as string,
        appointments: entry.appointments,
        noShows: entry.noShows,
        pct: entry.appointments > 0 ? Math.round((entry.noShows / entry.appointments) * 100) : 0,
      };
    });

    const activatedMonth = reminder?.enabledAt
      ? isoOf(new Date(reminder.enabledAt.getTime())).slice(0, 7)
      : null;
    const activatedIndex = activatedMonth === null ? -1 : months.indexOf(activatedMonth);

    return { points, whatsappActivatedIndex: activatedIndex === -1 ? null : activatedIndex };
  }

  /** Faixa de horas do gráfico "Hoje" — o expediente real, com recuo para 8h–22h. */
  private async openHours(tenantId: string): Promise<number[]> {
    const hours = await this.prisma.tenantBusinessHour.findMany({
      where: { tenantId, closed: false },
      select: { opensAt: true, closesAt: true },
    });

    const open = hours.length > 0
      ? Math.floor(Math.min(...hours.map((hour) => hour.opensAt)) / 60)
      : FALLBACK_OPEN_HOUR;
    const close = hours.length > 0
      ? Math.ceil(Math.max(...hours.map((hour) => hour.closesAt)) / 60)
      : FALLBACK_CLOSE_HOUR;

    const last = Math.max(open, Math.min(23, close));
    return Array.from({ length: last - open + 1 }, (_, index) => open + index);
  }
}

// ── Auxiliares puros ─────────────────────────────────────────────────────

function toTicket(row: RevenueByBarber): TicketByBarber {
  return {
    barberId: row.barberId,
    barberName: row.barberName,
    orders: row.orders,
    // Mesma definição do resto do produto (Dashboard, `/reports/summary`):
    // faturamento ÷ comandas fechadas. Trocar o denominador por "itens de
    // serviço" faria esta tabela discordar do KPI de ticket médio.
    ticketCents: row.orders > 0 ? Math.round(row.revenueCents / row.orders) : 0,
  };
}

/** "Pico: sábado, 10h–13h" — a janela de 3 horas mais cheia do dia mais cheio. */
function peakLabelOf(rows: HeatmapRow[], max: number): string | null {
  if (max === 0) {
    return null;
  }

  let best: { row: HeatmapRow; start: number; total: number } | null = null;
  for (const row of rows) {
    for (let index = 0; index + 2 < row.cells.length; index += 1) {
      const total =
        (row.cells[index]?.appointments ?? 0) +
        (row.cells[index + 1]?.appointments ?? 0) +
        (row.cells[index + 2]?.appointments ?? 0);
      if (best === null || total > best.total) {
        best = { row, start: index, total };
      }
    }
  }

  if (best === null || best.total === 0) {
    return null;
  }

  const day = HEATMAP_DAYS.find((entry) => entry.weekday === best?.row.weekday);
  const from = best.row.cells[best.start]?.hour ?? 0;
  const to = (best.row.cells[best.start + 2]?.hour ?? from) + 1;
  return `${day?.full ?? best.row.day}, ${from}h–${to}h`;
}

/** `YYYY-MM-DD` de um `timestamp` sem fuso devolvido pelo Postgres. */
function isoOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Rótulo do eixo X: dia da semana em "7 dias" (como o protótipo), `d/mês` no resto. */
function labelFor(day: string, key: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (key === '7d') {
    return WEEKDAY_SHORT[date.getUTCDay()] as string;
  }
  return `${date.getUTCDate()}/${MONTH_ABBR[date.getUTCMonth()] as string}`;
}

function lastMonths(endDay: string, count: number): string[] {
  const end = endDay.slice(0, 7);
  const [year, month] = end.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const total = year * 12 + (month - 1) - (count - 1 - index);
    const nextYear = Math.floor(total / 12);
    const nextMonth = total - nextYear * 12 + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
  });
}

function nextMonth(month: string): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
}

/** Meia-noite LOCAL do dia 1 do mês — não a meia-noite UTC. */
function monthStartUtc(month: string, timeZone: string): Date {
  return zonedTimeToUtc(`${month}-01`, 0, timeZone);
}
