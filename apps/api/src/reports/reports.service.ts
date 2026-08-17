import { Injectable } from '@nestjs/common';
import { AppointmentStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import type {
  ReportPeriodQuery,
  ReportsAdvancedResponse,
  ReportsSummaryResponse,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const RETURN_BUCKETS = [
  { label: '0–15 dias', max: 15 },
  { label: '16–30 dias', max: 30 },
  { label: '31–60 dias', max: 60 },
  { label: '60+ dias', max: Infinity },
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string, query: ReportPeriodQuery): Promise<ReportsSummaryResponse> {
    const { from, to } = resolvePeriod(query);

    const [orderAgg, paymentGroups] = await Promise.all([
      this.prisma.order.aggregate({
        where: { tenantId, status: OrderStatus.CLOSED, closedAt: { gte: from, lt: to } },
        _sum: { totalCents: true },
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { tenantId, status: PaymentStatus.PAID, paidAt: { gte: from, lt: to } },
        _sum: { amountCents: true },
        _count: true,
      }),
    ]);

    const revenueCents = orderAgg._sum.totalCents ?? 0;
    const orders = orderAgg._count;

    return {
      period: { from: isoDate(from), to: isoDate(to) },
      revenueCents,
      orders,
      averageTicketCents: orders > 0 ? Math.round(revenueCents / orders) : 0,
      paymentDistribution: paymentGroups.map((group) => ({
        method: group.method,
        amountCents: group._sum.amountCents ?? 0,
        count: group._count,
      })),
    };
  }

  async advanced(tenantId: string, query: ReportPeriodQuery): Promise<ReportsAdvancedResponse> {
    const { from, to } = resolvePeriod(query);

    const [revenueByBarberRaw, revenueByServiceRaw, revenueByDayRaw, occupancy, noShow, returnRows] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ barberId: string; barberName: string; revenueCents: bigint; orders: bigint }>>`
          SELECT b.id AS "barberId", b.name AS "barberName",
                 COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents",
                 COUNT(o.id)::bigint AS "orders"
          FROM "Order" o
          JOIN "Barber" b ON b.id = o."barberId"
          WHERE o."tenantId" = ${tenantId} AND o.status = 'CLOSED'
            AND o."closedAt" >= ${from} AND o."closedAt" < ${to}
          GROUP BY b.id, b.name
          ORDER BY "revenueCents" DESC
        `,
        this.prisma.$queryRaw<Array<{ serviceId: string; serviceName: string; revenueCents: bigint; count: bigint }>>`
          SELECT s.id AS "serviceId", s.name AS "serviceName",
                 COALESCE(SUM(oi."totalCents"), 0)::bigint AS "revenueCents",
                 COUNT(oi.id)::bigint AS "count"
          FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId"
          JOIN "Service" s ON s.id = oi."serviceId"
          WHERE oi."tenantId" = ${tenantId} AND oi.kind = 'SERVICE'
            AND o.status = 'CLOSED' AND o."closedAt" >= ${from} AND o."closedAt" < ${to}
          GROUP BY s.id, s.name
          ORDER BY "revenueCents" DESC
        `,
        this.prisma.$queryRaw<Array<{ day: Date; revenueCents: bigint }>>`
          SELECT date_trunc('day', o."closedAt") AS "day", COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents"
          FROM "Order" o
          WHERE o."tenantId" = ${tenantId} AND o.status = 'CLOSED'
            AND o."closedAt" >= ${from} AND o."closedAt" < ${to}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        this.occupancy(tenantId, from, to),
        this.prisma.appointment.groupBy({
          by: ['status'],
          where: {
            tenantId,
            startsAt: { gte: from, lt: to },
            status: { in: [AppointmentStatus.DONE, AppointmentStatus.NO_SHOW] },
          },
          _count: true,
        }),
        this.prisma.$queryRaw<Array<{ daysSince: number }>>`
          SELECT EXTRACT(DAY FROM (NOW() - cp."lastVisitAt"))::int AS "daysSince"
          FROM "ClientProfile" cp
          WHERE cp."tenantId" = ${tenantId} AND cp."lastVisitAt" IS NOT NULL AND cp."deletedAt" IS NULL
        `,
      ]);

    const doneCount = noShow.find((row) => row.status === AppointmentStatus.DONE)?._count ?? 0;
    const noShowCount = noShow.find((row) => row.status === AppointmentStatus.NO_SHOW)?._count ?? 0;
    const noShowDenominator = doneCount + noShowCount;

    const buckets = RETURN_BUCKETS.map((bucket) => ({ label: bucket.label, clients: 0 }));
    for (const row of returnRows) {
      const index = RETURN_BUCKETS.findIndex((bucket) => row.daysSince <= bucket.max);
      const bucket = buckets[index === -1 ? buckets.length - 1 : index];
      if (bucket) bucket.clients += 1;
    }

    return {
      period: { from: isoDate(from), to: isoDate(to) },
      occupancyRate: occupancy,
      noShowRate: noShowDenominator > 0 ? noShowCount / noShowDenominator : 0,
      revenueByBarber: revenueByBarberRaw.map((row) => ({
        barberId: row.barberId,
        barberName: row.barberName,
        revenueCents: Number(row.revenueCents),
        orders: Number(row.orders),
      })),
      revenueByService: revenueByServiceRaw.map((row) => ({
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        revenueCents: Number(row.revenueCents),
        count: Number(row.count),
      })),
      revenueByDay: revenueByDayRaw.map((row) => ({
        date: isoDate(row.day),
        revenueCents: Number(row.revenueCents),
      })),
      returnRate: buckets,
    };
  }

  /** Minutos ocupados (agendamentos confirmados/concluídos) sobre minutos de expediente disponíveis no período. */
  private async occupancy(tenantId: string, from: Date, to: Date): Promise<number> {
    const [bookedAgg, barberCount, hours] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          startsAt: { gte: from, lt: to },
          status: { in: [AppointmentStatus.DONE, AppointmentStatus.CONFIRMED] },
        },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.barber.count({ where: { tenantId, active: true } }),
      this.prisma.tenantBusinessHour.findMany({ where: { tenantId, closed: false } }),
    ]);

    const bookedMinutes = bookedAgg.reduce(
      (sum, appt) => sum + (appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000,
      0,
    );

    const avgDailyOpenMinutes =
      hours.length > 0
        ? hours.reduce((sum, hour) => sum + (hour.closesAt - hour.opensAt), 0) / 7
        : 0;
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1_000)));
    const availableMinutes = Math.max(1, barberCount) * avgDailyOpenMinutes * days;

    return availableMinutes > 0 ? Math.min(1, bookedMinutes / availableMinutes) : 0;
  }
}

function resolvePeriod(query: ReportPeriodQuery): { from: Date; to: Date } {
  const to = query.to ? endOfDay(new Date(`${query.to}T00:00:00.000Z`)) : new Date();
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : new Date(to.getTime() - THIRTY_DAYS_MS);
  return { from, to };
}

function endOfDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1_000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
