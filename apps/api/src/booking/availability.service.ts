import { Injectable } from '@nestjs/common';
import { AppointmentStatus, ScheduleExceptionType } from '@prisma/client';
import {
  minutesToTime,
  periodOfMinutes,
  type AvailabilityDay,
  type AvailabilityResponse,
  type AvailabilitySlot,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDays,
  dateKeyToUtcMidnight,
  toDateKey,
  utcDateToKey,
  weekdayOf,
  zonedTimeToUtc,
  type DateKey,
} from '../common/utils/timezone';

/** Quantos dias a faixa de chips do wizard mostra. */
export const AVAILABILITY_WINDOW_DAYS = 14;

/** Teto defensivo — ninguém pede 400 dias de agenda numa rota pública. */
export const AVAILABILITY_MAX_DAYS = 60;

export interface AvailabilityQuery {
  tenantId: string;
  /** Ausente = lido do próprio tenant. Quem já carregou o registro passa aqui. */
  timezone?: string;
  /** Serviços JÁ resolvidos (combo aplicado). */
  serviceIds: string[];
  totalDurationMin: number;
  /** `null` = "Sem preferência": qualquer barbeiro habilitado serve. */
  barberId: string | null;
  /** Primeiro dia da faixa. Padrão: hoje no fuso do tenant. */
  fromDate?: DateKey;
  /** Dia cujos horários vêm detalhados. Padrão: o primeiro com vaga. */
  selectedDate?: DateKey;
  days?: number;
  now?: Date;
}

/** Janela de trabalho em minutos desde a meia-noite local. */
interface Window {
  start: number;
  end: number;
}

interface BarberDayPlan {
  barberId: string;
  windows: Window[];
}

interface BusyInterval {
  barberId: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Motor de disponibilidade.
 *
 * Um horário só é oferecido quando TODAS estas coisas são verdade ao mesmo
 * tempo, e é por isso que o cálculo mora no servidor e não no wizard:
 *
 *   1. a barbearia abre naquele dia da semana (`TenantBusinessHour`);
 *   2. o barbeiro trabalha naquele dia (`WorkSchedule`, com almoço descontado);
 *   3. não há folga, férias nem feriado cobrindo a data (`ScheduleException` —
 *      a do barbeiro OU a da casa inteira, quando `barberId` é nulo);
 *   4. o atendimento INTEIRO cabe antes do fim do expediente — a duração é a
 *      soma dos serviços escolhidos, não a de um serviço qualquer;
 *   5. nada do barbeiro se sobrepõe àquele intervalo (`Appointment` ativo);
 *   6. o horário está no futuro, respeitando `antecedenciaMinima`.
 *
 * A grade nasce de `slotIntervalMin` (15 min por padrão), não da duração do
 * serviço: com passo igual à duração, um cancelamento às 09:20 deixaria buraco
 * que nunca mais seria oferecido.
 *
 * Tudo que é comparação de sobreposição acontece em INSTANTE (UTC), nunca em
 * minutos locais — assim uma virada de horário de verão no meio da janela não
 * cria nem esconde vaga.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailability(query: AvailabilityQuery): Promise<AvailabilityResponse> {
    const now = query.now ?? new Date();
    const timezone = query.timezone ?? (await this.timezoneOf(query.tenantId));
    const today = toDateKey(now, timezone);
    const fromDate = query.fromDate && query.fromDate >= today ? query.fromDate : today;
    const dayCount = Math.min(query.days ?? AVAILABILITY_WINDOW_DAYS, AVAILABILITY_MAX_DAYS);

    const dayKeys = Array.from({ length: dayCount }, (_, index) => addDays(fromDate, index));
    const lastDay = dayKeys[dayKeys.length - 1] ?? fromDate;

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: query.tenantId },
      select: { slotIntervalMin: true, antecedenciaMinima: true },
    });
    const slotInterval = settings?.slotIntervalMin ?? 15;
    const minLeadMs = (settings?.antecedenciaMinima ?? 60) * 60_000;
    const earliestStart = new Date(now.getTime() + minLeadMs);

    const barberIds = await this.eligibleBarberIds(query);

    // Sem barbeiro habilitado a agenda inteira é vazia — e nenhuma consulta
    // pesada precisa rodar para descobrir isso.
    if (barberIds.length === 0 || query.totalDurationMin <= 0) {
      return this.emptyResponse(query, timezone, dayKeys, fromDate);
    }

    const [businessHours, schedules, exceptions, busy] = await Promise.all([
      this.prisma.tenantBusinessHour.findMany({
        where: { tenantId: query.tenantId },
        select: { weekday: true, opensAt: true, closesAt: true, closed: true },
      }),
      this.prisma.workSchedule.findMany({
        where: { tenantId: query.tenantId, barberId: { in: barberIds } },
        select: {
          barberId: true,
          weekday: true,
          startTime: true,
          endTime: true,
          lunchStart: true,
          lunchEnd: true,
          isDayOff: true,
        },
      }),
      this.prisma.scheduleException.findMany({
        where: {
          tenantId: query.tenantId,
          // `barberId: null` é exceção da casa inteira (feriado) e vale para todos.
          OR: [{ barberId: { in: barberIds } }, { barberId: null }],
          startDate: { lte: dateKeyToUtcMidnight(lastDay) },
          endDate: { gte: dateKeyToUtcMidnight(fromDate) },
        },
        select: {
          barberId: true,
          startDate: true,
          endDate: true,
          type: true,
          startTime: true,
          endTime: true,
        },
      }),
      this.loadBusyIntervals(query.tenantId, barberIds, fromDate, lastDay, timezone),
    ]);

    const businessByWeekday = new Map(businessHours.map((hour) => [hour.weekday, hour]));
    const scheduleByBarberWeekday = new Map(
      schedules.map((schedule) => [`${schedule.barberId}:${schedule.weekday}`, schedule]),
    );

    const days: AvailabilityDay[] = [];
    const slotsByDay = new Map<DateKey, AvailabilitySlot[]>();

    for (const dateKey of dayKeys) {
      const weekday = weekdayOf(dateKey);
      const business = businessByWeekday.get(weekday);
      const shopClosed = business ? business.closed : false;

      // Feriado da casa fecha o dia para todo mundo, independente do barbeiro.
      const shopException = exceptions.some(
        (exception) =>
          exception.barberId === null &&
          exception.type !== ScheduleExceptionType.CUSTOM_HOURS &&
          coversDate(exception, dateKey),
      );

      if (shopClosed || shopException) {
        days.push({ date: dateKey, weekday, closed: true, soldOut: false, availableCount: 0 });
        slotsByDay.set(dateKey, []);
        continue;
      }

      const plans = barberIds
        .map((barberId) =>
          this.planFor({
            barberId,
            dateKey,
            weekday,
            schedule: scheduleByBarberWeekday.get(`${barberId}:${weekday}`) ?? null,
            business: business ?? null,
            exceptions,
          }),
        )
        .filter((plan): plan is BarberDayPlan => plan !== null);

      if (plans.length === 0) {
        // Ninguém trabalha: para o cliente é dia fechado, não dia lotado.
        days.push({ date: dateKey, weekday, closed: true, soldOut: false, availableCount: 0 });
        slotsByDay.set(dateKey, []);
        continue;
      }

      const slots = this.buildSlots({
        dateKey,
        timezone,
        plans,
        busy,
        slotInterval,
        durationMin: query.totalDurationMin,
        earliestStart,
      });

      slotsByDay.set(dateKey, slots);
      days.push({
        date: dateKey,
        weekday,
        closed: false,
        soldOut: slots.length === 0,
        availableCount: slots.length,
      });
    }

    // Sem dia pedido, abre no primeiro que tem vaga — o protótipo abre em "hoje"
    // e deixa o cliente esbarrar no vazio; começar cheio poupa um toque.
    const firstWithSlots = days.find((day) => day.availableCount > 0)?.date ?? null;
    const selectedDate =
      query.selectedDate && slotsByDay.has(query.selectedDate)
        ? query.selectedDate
        : (firstWithSlots ?? fromDate);

    const next = days.find(
      (day) => day.date > selectedDate && day.availableCount > 0,
    );

    return {
      timezone,
      totalDurationMin: query.totalDurationMin,
      resolvedServiceIds: query.serviceIds,
      days,
      selectedDate,
      slots: slotsByDay.get(selectedDate) ?? [],
      nextAvailableDate: next?.date ?? null,
      nextAvailableTime: next ? (slotsByDay.get(next.date)?.[0]?.time ?? null) : null,
    };
  }

  private async timezoneOf(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return tenant.timezone;
  }

  /**
   * Barbeiros que atendem TODOS os serviços escolhidos.
   *
   * "Todos" e não "algum": quem escolhe Corte + Pigmentação precisa de alguém
   * que faça as duas coisas na mesma cadeira, e no seed só o Diego faz
   * Pigmentação.
   */
  async eligibleBarberIds(query: {
    tenantId: string;
    serviceIds: string[];
    barberId: string | null;
  }): Promise<string[]> {
    const barbers = await this.prisma.barber.findMany({
      where: {
        tenantId: query.tenantId,
        active: true,
        deletedAt: null,
        ...(query.barberId ? { id: query.barberId } : {}),
        // Um AND por serviço: cada linha exige a habilitação daquele serviço.
        AND: query.serviceIds.map((serviceId) => ({
          barberServices: { some: { serviceId } },
        })),
      },
      select: { id: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return barbers.map((barber) => barber.id);
  }

  private async loadBusyIntervals(
    tenantId: string,
    barberIds: string[],
    fromDate: DateKey,
    lastDay: DateKey,
    timezone: string,
  ): Promise<BusyInterval[]> {
    // A janela vai do início do primeiro dia ao fim do último, no fuso local —
    // um agendamento das 19h do último dia tem de entrar na conta.
    const rangeStart = zonedTimeToUtc(fromDate, 0, timezone);
    const rangeEnd = zonedTimeToUtc(addDays(lastDay, 1), 0, timezone);

    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        barberId: { in: barberIds },
        // Os mesmos status que a EXCLUDE `no_double_booking` considera: cancelado
        // e falta devolvem o horário para a grade.
        status: { notIn: [AppointmentStatus.CANCELED, AppointmentStatus.NO_SHOW] },
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
      select: { barberId: true, startsAt: true, endsAt: true },
    });
  }

  /** Janelas de trabalho do barbeiro naquele dia, ou `null` se ele não trabalha. */
  private planFor(input: {
    barberId: string;
    dateKey: DateKey;
    weekday: number;
    schedule: {
      startTime: number;
      endTime: number;
      lunchStart: number | null;
      lunchEnd: number | null;
      isDayOff: boolean;
    } | null;
    business: { opensAt: number; closesAt: number; closed: boolean } | null;
    exceptions: Array<{
      barberId: string | null;
      startDate: Date;
      endDate: Date;
      type: ScheduleExceptionType;
      startTime: number | null;
      endTime: number | null;
    }>;
  }): BarberDayPlan | null {
    const { schedule, business, dateKey, barberId } = input;

    if (!schedule || schedule.isDayOff) {
      return null;
    }

    const mine = input.exceptions.filter(
      (exception) =>
        (exception.barberId === barberId || exception.barberId === null) &&
        coversDate(exception, dateKey),
    );

    if (mine.some((exception) => exception.type !== ScheduleExceptionType.CUSTOM_HOURS)) {
      return null;
    }

    const custom = mine.find((exception) => exception.type === ScheduleExceptionType.CUSTOM_HOURS);

    let start = custom?.startTime ?? schedule.startTime;
    let end = custom?.endTime ?? schedule.endTime;

    // O expediente do barbeiro nunca extrapola o da casa: a porta está fechada.
    if (business && !business.closed) {
      start = Math.max(start, business.opensAt);
      end = Math.min(end, business.closesAt);
    }

    if (end <= start) {
      return null;
    }

    let windows: Window[] = [{ start, end }];

    if (schedule.lunchStart !== null && schedule.lunchEnd !== null) {
      windows = subtractWindow(windows, { start: schedule.lunchStart, end: schedule.lunchEnd });
    }

    return windows.length > 0 ? { barberId, windows } : null;
  }

  private buildSlots(input: {
    dateKey: DateKey;
    timezone: string;
    plans: BarberDayPlan[];
    busy: BusyInterval[];
    slotInterval: number;
    durationMin: number;
    earliestStart: Date;
  }): AvailabilitySlot[] {
    const { dateKey, timezone, plans, busy, slotInterval, durationMin, earliestStart } = input;
    const durationMs = durationMin * 60_000;

    /** Minutos locais → lista de barbeiros livres. Mantém a ordem de inserção. */
    const byMinute = new Map<number, { startsAt: Date; barberIds: string[] }>();

    for (const plan of plans) {
      const barberBusy = busy.filter((interval) => interval.barberId === plan.barberId);

      for (const window of plan.windows) {
        // O primeiro slot alinha na grade do tenant (09:00, 09:15…), e não no
        // início cru da janela, senão cada barbeiro teria uma grade própria.
        const firstStart = Math.ceil(window.start / slotInterval) * slotInterval;

        for (let minute = firstStart; minute + durationMin <= window.end; minute += slotInterval) {
          const startsAt = zonedTimeToUtc(dateKey, minute, timezone);
          if (startsAt.getTime() < earliestStart.getTime()) {
            continue;
          }

          const endsAt = new Date(startsAt.getTime() + durationMs);
          const collides = barberBusy.some(
            (interval) => interval.startsAt < endsAt && interval.endsAt > startsAt,
          );
          if (collides) {
            continue;
          }

          const existing = byMinute.get(minute);
          if (existing) {
            existing.barberIds.push(plan.barberId);
          } else {
            byMinute.set(minute, { startsAt, barberIds: [plan.barberId] });
          }
        }
      }
    }

    return [...byMinute.entries()]
      .sort(([a], [b]) => a - b)
      .map(([minute, entry]) => ({
        time: minutesToTime(minute),
        startsAt: entry.startsAt.toISOString(),
        period: periodOfMinutes(minute),
        barberIds: entry.barberIds,
      }));
  }

  private emptyResponse(
    query: AvailabilityQuery,
    timezone: string,
    dayKeys: DateKey[],
    fromDate: DateKey,
  ): AvailabilityResponse {
    return {
      timezone,
      totalDurationMin: query.totalDurationMin,
      resolvedServiceIds: query.serviceIds,
      days: dayKeys.map((date) => ({
        date,
        weekday: weekdayOf(date),
        closed: true,
        soldOut: false,
        availableCount: 0,
      })),
      selectedDate: query.selectedDate ?? fromDate,
      slots: [],
      nextAvailableDate: null,
      nextAvailableTime: null,
    };
  }
}

/** A exceção cobre este dia? `startDate`/`endDate` são `@db.Date`, inclusivas. */
function coversDate(
  exception: { startDate: Date; endDate: Date },
  dateKey: DateKey,
): boolean {
  return utcDateToKey(exception.startDate) <= dateKey && utcDateToKey(exception.endDate) >= dateKey;
}

/** Remove um buraco (almoço) das janelas, podendo partir uma em duas. */
export function subtractWindow(windows: Window[], hole: Window): Window[] {
  const out: Window[] = [];

  for (const window of windows) {
    if (hole.end <= window.start || hole.start >= window.end) {
      out.push(window);
      continue;
    }
    if (hole.start > window.start) {
      out.push({ start: window.start, end: hole.start });
    }
    if (hole.end < window.end) {
      out.push({ start: hole.end, end: window.end });
    }
  }

  return out.filter((window) => window.end > window.start);
}
