import { Injectable } from '@nestjs/common';
import { AppointmentStatus, CashRegisterStatus, OrderStatus, Prisma } from '@prisma/client';
import {
  SPARKLINE_POINTS,
  hasFeature,
  type DashboardAlerts,
  type DashboardBarberRankItem,
  type DashboardKpis,
  type DashboardOverviewResponse,
  type DashboardPeriod,
  type DashboardRevenueChart,
  type DashboardRevenuePoint,
  type DashboardTopService,
  type DashboardUpcomingAppointment,
  type FeatureKey,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { addDays, toMinutesOfDay, weekdayOf, type DateKey } from '../common/utils/timezone';
import type { StaffScope } from '../staff-agenda/staff-scope.service';
import {
  dayRange,
  deltaPct,
  initialsOf,
  lastDayKeys,
  lastMonthKeys,
  monthKeyOf,
  monthRange,
  todayKey,
  type MonthKey,
  type Range,
} from './dashboard-window';

const INACTIVE_CLIENT_DAYS = 30;
const UPCOMING_LIMIT = 10;
const TOP_SERVICES_LIMIT = 5;
/** "Esta semana" dos alertas e do ranking. */
const WEEK_DAYS = 7;
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type Bucketed = Map<string, number>;

/**
 * `GET /dashboard/overview` — a tela `/app` inteira numa chamada.
 *
 * Tudo é agregado em SQL (`GROUP BY` no banco), nunca varrendo linha a linha em
 * JS: são ~12 consultas de contagem/soma disparadas em paralelo, e nenhuma
 * cresce com o número de agendamentos exibidos.
 *
 * Os dois recortes que este serviço aplica são regra de negócio, não cosmético:
 *
 * 1. **Papel** — `BARBER` (`StaffScope.forcedBarberId`) só enxerga os próprios
 *    números, e os alertas de gestão (clientes inativos, contas, caixa,
 *    aniversários) somem inteiros: são ações de dono, e os botões levariam a
 *    telas que o `RolesGuard` já recusa.
 * 2. **Plano** — o alerta de contas a pagar só existe com `contasPagarReceber`.
 *    O que o plano esconde volta em `lockedByPlan`, para o front mostrar upsell
 *    em vez de uma caixa vazia mentindo que não há dado.
 */
@Injectable()
export class DashboardOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(
    tenantId: string,
    scope: StaffScope,
    period: DashboardPeriod,
  ): Promise<DashboardOverviewResponse> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: {
        timezone: true,
        plan: { select: { features: true } },
        settings: { select: { monthlyGoalCents: true } },
        businessHours: { select: { weekday: true, opensAt: true, closesAt: true, closed: true } },
      },
    });

    if (!tenant) {
      throw ApiException.notFound('Barbearia não encontrada.');
    }

    const tz = tenant.timezone;
    const barberId = scope.forcedBarberId;
    const today = todayKey(tz);
    const thisMonth = monthKeyOf(today);

    const dayKeys = lastDayKeys(today, SPARKLINE_POINTS);
    const monthKeys = lastMonthKeys(thisMonth, SPARKLINE_POINTS);
    const dailyWindow: Range = {
      from: dayRange(dayKeys[0] as DateKey, tz).from,
      to: dayRange(today, tz).to,
    };
    const monthlyWindow: Range = {
      from: monthRange(monthKeys[0] as MonthKey, tz).from,
      to: monthRange(thisMonth, tz).to,
    };
    const todayWindow = dayRange(today, tz);
    const weekWindow: Range = {
      from: dayRange(addDays(today, -(WEEK_DAYS - 1)), tz).from,
      to: todayWindow.to,
    };
    const canSeeManagement = barberId === null;
    const canSeeBills = canSeeManagement && hasFeature(tenant.plan?.features, 'contasPagarReceber');

    const [
      revenueByDay,
      revenueByMonth,
      newClientsByMonth,
      noShowsByMonth,
      appointmentsToday,
      occupancy,
      chart,
      topServices,
      barberRanking,
      upcoming,
      alerts,
    ] = await Promise.all([
      this.revenueByDay(tenantId, tz, barberId, dailyWindow),
      this.revenueByMonth(tenantId, tz, barberId, monthlyWindow),
      this.newClientsByMonth(tenantId, tz, barberId, monthlyWindow),
      this.noShowsByMonth(tenantId, tz, barberId, monthlyWindow),
      this.appointmentsToday(tenantId, barberId, todayWindow),
      this.occupancyPct(tenantId, barberId, today, todayWindow, tenant.businessHours),
      this.revenueChart(tenantId, tz, barberId, period, today, tenant.businessHours, tenant.settings?.monthlyGoalCents ?? null),
      this.topServices(tenantId, barberId, monthRange(thisMonth, tz)),
      this.barberRanking(tenantId, barberId, weekWindow),
      this.upcomingAppointments(tenantId, tz, barberId, todayWindow),
      this.alerts(tenantId, tz, today, canSeeManagement, canSeeBills),
    ]);

    const revenueSeries = dayKeys.map((key) => revenueByDay.get(key) ?? 0);
    const revenueToday = revenueSeries[revenueSeries.length - 1] ?? 0;
    const revenueYesterday = revenueSeries[revenueSeries.length - 2] ?? 0;

    const avgTicketSeries = monthKeys.map((key) => revenueByMonth.get(key)?.avgTicketCents ?? 0);
    const newClientsSeries = monthKeys.map((key) => newClientsByMonth.get(key) ?? 0);
    const noShowsSeries = monthKeys.map((key) => noShowsByMonth.get(key) ?? 0);

    const kpis: DashboardKpis = {
      revenueTodayCents: revenueToday,
      revenueDeltaPct: deltaPct(revenueToday, revenueYesterday),
      revenueSparkline: revenueSeries,
      appointmentsToday,
      occupancyPct: occupancy,
      avgTicketCents: last(avgTicketSeries),
      avgTicketDeltaPct: deltaPct(last(avgTicketSeries), previous(avgTicketSeries)),
      avgTicketSparkline: avgTicketSeries,
      newClients: last(newClientsSeries),
      newClientsDeltaPct: deltaPct(last(newClientsSeries), previous(newClientsSeries)),
      newClientsSparkline: newClientsSeries,
      noShows: last(noShowsSeries),
      noShowsDeltaPct: deltaPct(last(noShowsSeries), previous(noShowsSeries)),
      noShowsSparkline: noShowsSeries,
    };

    const lockedByPlan: FeatureKey[] = [];
    if (canSeeManagement && !canSeeBills) {
      lockedByPlan.push('contasPagarReceber');
    }

    return {
      period,
      timezone: tz,
      scope: barberId ? 'BARBER' : 'TENANT',
      kpis,
      revenueChart: chart,
      topServices,
      barberRanking,
      upcomingAppointments: upcoming,
      alerts,
      lockedByPlan,
    };
  }

  // ── Séries ─────────────────────────────────────────────────────────────

  private async revenueByDay(
    tenantId: string,
    tz: string,
    barberId: string | null,
    window: Range,
  ): Promise<Bucketed> {
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; cents: bigint }>>`
      SELECT to_char(o."closedAt" AT TIME ZONE ${tz}::text, 'YYYY-MM-DD') AS "bucket",
             COALESCE(SUM(o."totalCents"), 0)::bigint AS "cents"
      FROM "Order" o
      WHERE o."tenantId" = ${tenantId}
        AND o.status = ${OrderStatus.CLOSED}::"OrderStatus"
        AND o."deletedAt" IS NULL
        AND o."closedAt" >= ${window.from} AND o."closedAt" < ${window.to}
        ${barberFilter(barberId)}
      GROUP BY 1
    `;
    return new Map(rows.map((row) => [row.bucket, Number(row.cents)]));
  }

  private async revenueByMonth(
    tenantId: string,
    tz: string,
    barberId: string | null,
    window: Range,
  ): Promise<Map<string, { revenueCents: number; orders: number; avgTicketCents: number }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ bucket: string; cents: bigint; orders: bigint }>
    >`
      SELECT to_char(o."closedAt" AT TIME ZONE ${tz}::text, 'YYYY-MM') AS "bucket",
             COALESCE(SUM(o."totalCents"), 0)::bigint AS "cents",
             COUNT(o.id)::bigint AS "orders"
      FROM "Order" o
      WHERE o."tenantId" = ${tenantId}
        AND o.status = ${OrderStatus.CLOSED}::"OrderStatus"
        AND o."deletedAt" IS NULL
        AND o."closedAt" >= ${window.from} AND o."closedAt" < ${window.to}
        ${barberFilter(barberId)}
      GROUP BY 1
    `;

    return new Map(
      rows.map((row) => {
        const revenueCents = Number(row.cents);
        const orders = Number(row.orders);
        return [
          row.bucket,
          {
            revenueCents,
            orders,
            avgTicketCents: orders > 0 ? Math.round(revenueCents / orders) : 0,
          },
        ];
      }),
    );
  }

  /**
   * Clientes novos por mês.
   *
   * Para a barbearia, "novo" é `ClientProfile.firstVisitAt` — a primeira visita
   * NESTE tenant. Para um barbeiro, o mesmo conceito só faz sentido em relação
   * a ele: é a primeira vez que aquele cliente sentou na cadeira dele, o que a
   * subconsulta resolve com um `MIN(startsAt)` por cliente.
   */
  private async newClientsByMonth(
    tenantId: string,
    tz: string,
    barberId: string | null,
    window: Range,
  ): Promise<Bucketed> {
    const rows = barberId
      ? await this.prisma.$queryRaw<Array<{ bucket: string; total: bigint }>>`
          SELECT to_char(f."firstAt" AT TIME ZONE ${tz}::text, 'YYYY-MM') AS "bucket",
                 COUNT(*)::bigint AS "total"
          FROM (
            SELECT a."clientId", MIN(a."startsAt") AS "firstAt"
            FROM "Appointment" a
            WHERE a."tenantId" = ${tenantId}
              AND a."barberId" = ${barberId}
              AND a."clientId" IS NOT NULL
              AND a.status IN ('CONFIRMED', 'DONE')
            GROUP BY a."clientId"
          ) f
          WHERE f."firstAt" >= ${window.from} AND f."firstAt" < ${window.to}
          GROUP BY 1
        `
      : await this.prisma.$queryRaw<Array<{ bucket: string; total: bigint }>>`
          SELECT to_char(cp."firstVisitAt" AT TIME ZONE ${tz}::text, 'YYYY-MM') AS "bucket",
                 COUNT(*)::bigint AS "total"
          FROM "ClientProfile" cp
          WHERE cp."tenantId" = ${tenantId}
            AND cp."deletedAt" IS NULL
            AND cp."firstVisitAt" >= ${window.from} AND cp."firstVisitAt" < ${window.to}
          GROUP BY 1
        `;

    return new Map(rows.map((row) => [row.bucket, Number(row.total)]));
  }

  private async noShowsByMonth(
    tenantId: string,
    tz: string,
    barberId: string | null,
    window: Range,
  ): Promise<Bucketed> {
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; total: bigint }>>`
      SELECT to_char(a."startsAt" AT TIME ZONE ${tz}::text, 'YYYY-MM') AS "bucket",
             COUNT(*)::bigint AS "total"
      FROM "Appointment" a
      WHERE a."tenantId" = ${tenantId}
        AND a.status = ${AppointmentStatus.NO_SHOW}::"AppointmentStatus"
        AND a."startsAt" >= ${window.from} AND a."startsAt" < ${window.to}
        ${appointmentBarberFilter(barberId)}
      GROUP BY 1
    `;
    return new Map(rows.map((row) => [row.bucket, Number(row.total)]));
  }

  // ── KPIs pontuais ──────────────────────────────────────────────────────

  private async appointmentsToday(
    tenantId: string,
    barberId: string | null,
    window: Range,
  ): Promise<DashboardKpis['appointmentsToday']> {
    const groups = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: {
        tenantId,
        ...(barberId ? { barberId } : {}),
        startsAt: { gte: window.from, lt: window.to },
      },
      _count: true,
    });

    const countOf = (status: AppointmentStatus): number =>
      groups.find((group) => group.status === status)?._count ?? 0;

    const confirmed = countOf(AppointmentStatus.CONFIRMED);
    const pending = countOf(AppointmentStatus.SCHEDULED);
    const done = countOf(AppointmentStatus.DONE);

    return {
      // O card do protótipo detalha "confirmados · pendentes · concluídos"; o
      // total é a soma dessas três linhas — cancelado e falta não contam como
      // agendamento do dia.
      total: confirmed + pending + done,
      confirmed,
      pending,
      done,
    };
  }

  /** Minutos ocupados hoje sobre minutos de cadeira disponíveis hoje, 0–100. */
  private async occupancyPct(
    tenantId: string,
    barberId: string | null,
    today: DateKey,
    window: Range,
    businessHours: Array<{ weekday: number; opensAt: number; closesAt: number; closed: boolean }>,
  ): Promise<number> {
    const [booked, barbers] = await Promise.all([
      this.prisma.$queryRaw<Array<{ minutes: number | null }>>`
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (a."endsAt" - a."startsAt")) / 60), 0)::float AS "minutes"
        FROM "Appointment" a
        WHERE a."tenantId" = ${tenantId}
          AND a.status IN ('CONFIRMED', 'DONE', 'SCHEDULED')
          AND a."startsAt" >= ${window.from} AND a."startsAt" < ${window.to}
          ${appointmentBarberFilter(barberId)}
      `,
      barberId
        ? Promise.resolve(1)
        : this.prisma.barber.count({ where: { tenantId, active: true, deletedAt: null } }),
    ]);

    const hours = businessHours.find((hour) => hour.weekday === weekdayOf(today));
    if (!hours || hours.closed || barbers === 0) {
      return 0;
    }

    const availableMinutes = (hours.closesAt - hours.opensAt) * barbers;
    if (availableMinutes <= 0) {
      return 0;
    }

    const bookedMinutes = booked[0]?.minutes ?? 0;
    return Math.min(100, Math.round((bookedMinutes / availableMinutes) * 100));
  }

  // ── Gráfico ────────────────────────────────────────────────────────────

  private async revenueChart(
    tenantId: string,
    tz: string,
    barberId: string | null,
    period: DashboardPeriod,
    today: DateKey,
    businessHours: Array<{ weekday: number; opensAt: number; closesAt: number; closed: boolean }>,
    goalCents: number | null,
  ): Promise<DashboardRevenueChart> {
    if (period === 'dia') {
      return this.hourlyChart(tenantId, tz, barberId, today, businessHours, goalCents);
    }

    const days = period === 'semana' ? WEEK_DAYS : 30;
    const keys = lastDayKeys(today, days);
    const window: Range = {
      from: dayRange(keys[0] as DateKey, tz).from,
      to: dayRange(today, tz).to,
    };
    const revenue = await this.revenueByDay(tenantId, tz, barberId, window);

    const points: DashboardRevenuePoint[] = keys.map((key) => ({
      label:
        period === 'semana'
          ? (WEEKDAY_LABELS[weekdayOf(key)] as string)
          : `${key.slice(8, 10)}/${key.slice(5, 7)}`,
      valueCents: revenue.get(key) ?? 0,
    }));

    // A meta é mensal; a linha tracejada mora no balde, então divide-se pelo
    // número de dias do mês, não pelo número de pontos exibidos.
    return {
      period,
      points,
      goalCents,
      goalPerPointCents: goalCents === null ? null : Math.round(goalCents / daysInMonth(today)),
    };
  }

  private async hourlyChart(
    tenantId: string,
    tz: string,
    barberId: string | null,
    today: DateKey,
    businessHours: Array<{ weekday: number; opensAt: number; closesAt: number; closed: boolean }>,
    goalCents: number | null,
  ): Promise<DashboardRevenueChart> {
    const open = businessHours.filter((hour) => !hour.closed);
    if (open.length === 0) {
      return { period: 'dia', points: [], goalCents, goalPerPointCents: null };
    }

    // A faixa de horas do eixo é a união do expediente da semana: usar só o
    // dia de hoje faria o gráfico mudar de largura de segunda para sábado.
    const firstHour = Math.floor(Math.min(...open.map((hour) => hour.opensAt)) / 60);
    const lastHour = Math.ceil(Math.max(...open.map((hour) => hour.closesAt)) / 60);

    const window = dayRange(today, tz);
    const rows = await this.prisma.$queryRaw<Array<{ bucket: number; cents: bigint }>>`
      SELECT EXTRACT(HOUR FROM o."closedAt" AT TIME ZONE ${tz}::text)::int AS "bucket",
             COALESCE(SUM(o."totalCents"), 0)::bigint AS "cents"
      FROM "Order" o
      WHERE o."tenantId" = ${tenantId}
        AND o.status = ${OrderStatus.CLOSED}::"OrderStatus"
        AND o."deletedAt" IS NULL
        AND o."closedAt" >= ${window.from} AND o."closedAt" < ${window.to}
        ${barberFilter(barberId)}
      GROUP BY 1
    `;
    const byHour = new Map(rows.map((row) => [row.bucket, Number(row.cents)]));

    const points: DashboardRevenuePoint[] = [];
    for (let hour = firstHour; hour <= lastHour; hour += 1) {
      points.push({ label: `${String(hour).padStart(2, '0')}h`, valueCents: byHour.get(hour) ?? 0 });
    }

    const openHours = Math.max(1, lastHour - firstHour);
    return {
      period: 'dia',
      points,
      goalCents,
      goalPerPointCents:
        goalCents === null ? null : Math.round(goalCents / daysInMonth(today) / openHours),
    };
  }

  // ── Blocos ─────────────────────────────────────────────────────────────

  private async topServices(
    tenantId: string,
    barberId: string | null,
    window: Range,
  ): Promise<DashboardTopService[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ serviceId: string; name: string; cents: bigint }>
    >`
      SELECT s.id AS "serviceId", s.name AS "name",
             COALESCE(SUM(oi."totalCents"), 0)::bigint AS "cents"
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Service" s ON s.id = oi."serviceId"
      WHERE oi."tenantId" = ${tenantId}
        AND oi.kind = 'SERVICE'
        AND o.status = ${OrderStatus.CLOSED}::"OrderStatus"
        AND o."deletedAt" IS NULL
        AND o."closedAt" >= ${window.from} AND o."closedAt" < ${window.to}
        ${barberId ? Prisma.sql`AND o."barberId" = ${barberId}` : Prisma.empty}
      GROUP BY s.id, s.name
      HAVING SUM(oi."totalCents") > 0
      ORDER BY "cents" DESC
    `;

    const total = rows.reduce((sum, row) => sum + Number(row.cents), 0);
    if (total === 0) {
      return [];
    }

    const top = rows.slice(0, TOP_SERVICES_LIMIT).map((row) => ({
      serviceId: row.serviceId,
      name: row.name,
      revenueCents: Number(row.cents),
      pct: Math.round((Number(row.cents) / total) * 100),
    }));

    const restCents = rows.slice(TOP_SERVICES_LIMIT).reduce((sum, row) => sum + Number(row.cents), 0);
    if (restCents > 0) {
      top.push({
        serviceId: null as unknown as string,
        name: 'Outros',
        revenueCents: restCents,
        pct: Math.round((restCents / total) * 100),
      });
    }

    return top as DashboardTopService[];
  }

  private async barberRanking(
    tenantId: string,
    barberId: string | null,
    window: Range,
  ): Promise<DashboardBarberRankItem[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; total: bigint; cents: bigint }>
    >`
      SELECT b.id AS "id", b.name AS "name",
             COUNT(o.id)::bigint AS "total",
             COALESCE(SUM(o."totalCents"), 0)::bigint AS "cents"
      FROM "Barber" b
      JOIN "Order" o
        ON o."barberId" = b.id
       AND o."tenantId" = ${tenantId}
       AND o.status = ${OrderStatus.CLOSED}::"OrderStatus"
       AND o."deletedAt" IS NULL
       AND o."closedAt" >= ${window.from} AND o."closedAt" < ${window.to}
      WHERE b."tenantId" = ${tenantId}
        AND b."deletedAt" IS NULL
        ${barberId ? Prisma.sql`AND b.id = ${barberId}` : Prisma.empty}
      GROUP BY b.id, b.name
      ORDER BY "cents" DESC, "total" DESC
    `;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      initials: initialsOf(row.name),
      count: Number(row.total),
      revenueCents: Number(row.cents),
    }));
  }

  private async upcomingAppointments(
    tenantId: string,
    tz: string,
    barberId: string | null,
    window: Range,
  ): Promise<DashboardUpcomingAppointment[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        ...(barberId ? { barberId } : {}),
        startsAt: { gte: window.from, lt: window.to },
      },
      orderBy: { startsAt: 'asc' },
      take: UPCOMING_LIMIT,
      select: {
        id: true,
        startsAt: true,
        status: true,
        guestName: true,
        client: { select: { name: true } },
        barber: { select: { name: true } },
        service: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      time: formatClock(row.startsAt, tz),
      clientName: row.client?.name ?? row.guestName ?? 'Sem cadastro',
      serviceName: row.service.name,
      barberName: row.barber.name,
      status: row.status,
    }));
  }

  // ── Alertas ────────────────────────────────────────────────────────────

  private async alerts(
    tenantId: string,
    tz: string,
    today: DateKey,
    canSeeManagement: boolean,
    canSeeBills: boolean,
  ): Promise<DashboardAlerts> {
    if (!canSeeManagement) {
      return { inactiveClients: 0, dueBills: null, cashRegisterOpen: null, birthdays: 0 };
    }

    const inactiveBefore = dayRange(addDays(today, -INACTIVE_CLIENT_DAYS), tz).from;
    const weekAhead = Array.from({ length: WEEK_DAYS }, (_, index) =>
      addDays(today, index).slice(5),
    );

    const [inactiveClients, dueBills, openRegister, birthdays] = await Promise.all([
      this.prisma.clientProfile.count({
        where: { tenantId, deletedAt: null, lastVisitAt: { not: null, lt: inactiveBefore } },
      }),
      canSeeBills
        ? this.prisma.accountPayable.aggregate({
            where: {
              tenantId,
              deletedAt: null,
              status: 'PENDING',
              dueDate: {
                gte: new Date(`${today}T00:00:00.000Z`),
                lte: new Date(`${addDays(today, WEEK_DAYS - 1)}T00:00:00.000Z`),
              },
            },
            _count: true,
            _sum: { amountCents: true },
          })
        : Promise.resolve(null),
      this.prisma.cashRegister.count({
        where: { tenantId, status: CashRegisterStatus.OPEN },
      }),
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*)::bigint AS "total"
        FROM "ClientProfile" cp
        JOIN "Client" c ON c.id = cp."clientId"
        WHERE cp."tenantId" = ${tenantId}
          AND cp."deletedAt" IS NULL
          AND c."deletedAt" IS NULL
          AND c."birthDate" IS NOT NULL
          AND to_char(c."birthDate", 'MM-DD') = ANY(${weekAhead}::text[])
      `,
    ]);

    return {
      inactiveClients,
      dueBills: dueBills
        ? { count: dueBills._count, totalCents: dueBills._sum.amountCents ?? 0 }
        : null,
      cashRegisterOpen: openRegister > 0,
      birthdays: Number(birthdays[0]?.total ?? 0),
    };
  }
}

/** Filtro por barbeiro nas comandas — `Prisma.empty` some do SQL sem placeholder. */
function barberFilter(barberId: string | null): Prisma.Sql {
  return barberId ? Prisma.sql`AND o."barberId" = ${barberId}` : Prisma.empty;
}

function appointmentBarberFilter(barberId: string | null): Prisma.Sql {
  return barberId ? Prisma.sql`AND a."barberId" = ${barberId}` : Prisma.empty;
}

function last(series: number[]): number {
  return series[series.length - 1] ?? 0;
}

function previous(series: number[]): number {
  return series[series.length - 2] ?? 0;
}

function daysInMonth(dateKey: DateKey): number {
  const [year, month] = dateKey.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `HH:mm` no fuso da barbearia. */
function formatClock(instant: Date, tz: string): string {
  const minutes = toMinutesOfDay(instant, tz);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
