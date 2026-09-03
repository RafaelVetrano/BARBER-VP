import { HttpStatus, Injectable } from '@nestjs/common';
import { AppointmentOrigin, AppointmentStatus, Prisma, ScheduleExceptionType } from '@prisma/client';
import {
  AgendaView,
  ErrorCode,
  normalizeMobilePhone,
  periodOfMinutes,
  type StaffAgendaBarberColumn,
  type StaffAgendaBlock,
  type StaffAgendaMonthCell,
  type StaffAgendaMonthResponse,
  type StaffAgendaResponse,
  type StaffAppointmentDetail,
  type StaffAgendaSlot,
  type StaffAgendaSlotsResponse,
  type StaffAppointmentItem,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import {
  addDays,
  dateKeyToUtcMidnight,
  isValidDateKey,
  toDateKey,
  toMinutesOfDay,
  utcDateToKey,
  weekdayOf,
  zonedTimeToUtc,
  type DateKey,
} from '../common/utils/timezone';
import { AvailabilityService, subtractWindow } from '../booking/availability.service';
import { BookingNotificationsService } from '../booking/booking-notifications.service';
import { CatalogService } from '../booking/catalog.service';
import { SubscriptionCoverageService } from '../booking/subscription-coverage.service';
import { generateBookingCode } from '../booking/booking-code';
import { isExclusionViolation } from '../booking/appointments.service';
import type {
  CreateStaffAgendaBlockDto,
  CreateStaffAppointmentDto,
  MoveStaffAppointmentDto,
  CancelStaffAppointmentDto,
} from './dto/staff-agenda.dto';
import type { StaffScope } from './staff-scope.service';
import { StaffScopeService } from './staff-scope.service';

const APPOINTMENT_INCLUDE = {
  barber: { select: { id: true, name: true } },
  client: { select: { id: true, name: true, phone: true } },
  services: {
    select: {
      serviceId: true,
      sortOrder: true,
      priceCents: true,
      durationMin: true,
      subscriptionUsageId: true,
      service: { select: { name: true, color: true } },
    },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

const CODE_ATTEMPTS = 5;

/** Quantas visitas o drawer lista em "Últimas visitas". */
const HISTORY_SIZE = 3;

/** Mesmo padrão do `AvailabilityService` quando o tenant não configurou. */
const DEFAULT_SLOT_INTERVAL = 15;

interface ScheduleRow {
  startTime: number;
  endTime: number;
  lunchStart: number | null;
  lunchEnd: number | null;
  isDayOff: boolean;
}

interface ExceptionRow {
  id: string;
  barberId: string | null;
  startDate: Date;
  endDate: Date;
  type: ScheduleExceptionType;
  startTime: number | null;
  endTime: number | null;
  reason: string | null;
}

interface DayPlanInputs {
  /** Chave `barberId:weekday`. */
  schedules: Map<string, ScheduleRow>;
  exceptions: ExceptionRow[];
  /** Chave `weekday`. */
  business: Map<
    number,
    {
      opensAt: number;
      closesAt: number;
      closed: boolean;
      lunchStart: number | null;
      lunchEnd: number | null;
    }
  >;
}

interface Shift {
  workStart: number | null;
  workEnd: number | null;
  lunchStart: number | null;
  lunchEnd: number | null;
  blocks: StaffAgendaBlock[];
}

/** O que `POST /staff-agenda/blocks` devolve. */
export interface StaffAgendaBlockItemRow {
  id: string;
  barberId: string | null;
  startDate: string;
  endDate: string;
  startMinutes: number | null;
  endMinutes: number | null;
  reason: string | null;
}

/**
 * Agenda interna do dashboard — criar/mover/cancelar pelo staff, incluindo
 * walk-in (agendamento sem cliente cadastrado), usando o MESMO motor de
 * disponibilidade da fase 04 (`AvailabilityService`/`CatalogService`).
 *
 * Duas diferenças de propósito em relação ao canal público, as duas
 * documentadas no ponto em que aparecem: (1) sem desafio de OTP — quem cria é
 * a própria equipe, autenticada; (2) sem `antecedenciaMinima`/"só no futuro" —
 * o cliente pode estar na cadeira NESTE instante.
 */
@Injectable()
export class StaffAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly catalog: CatalogService,
    private readonly coverage: SubscriptionCoverageService,
    private readonly audit: AuditService,
    private readonly scopes: StaffScopeService,
    private readonly notifications: BookingNotificationsService,
  ) {}

  async timezoneOf(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { timezone: true } });
    if (!tenant) {
      throw ApiException.notFound('Barbearia não encontrada.');
    }
    return tenant.timezone;
  }

  async getAgenda(
    tenantId: string,
    timezone: string,
    query: { date: string; view: AgendaView; barberIds?: string[] },
    scope: StaffScope,
  ): Promise<StaffAgendaResponse> {
    if (!isValidDateKey(query.date)) {
      throw ApiException.badRequest('Data inválida.');
    }

    const allBarbers = await this.prisma.barber.findMany({
      where: { tenantId, deletedAt: null, active: true },
      select: { id: true, name: true, avatarUrl: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // `BARBER` ignora o filtro da tela: o recorte dele é o próprio, sempre.
    const barberOptions = scope.forcedBarberId
      ? allBarbers.filter((barber) => barber.id === scope.forcedBarberId)
      : allBarbers;
    const columns = scope.forcedBarberId
      ? barberOptions
      : query.barberIds && query.barberIds.length > 0
        ? allBarbers.filter((barber) => query.barberIds!.includes(barber.id))
        : allBarbers;

    const dateKeys: DateKey[] = query.view === AgendaView.WEEK ? weekDates(query.date) : [query.date];
    const columnIds = columns.map((barber) => barber.id);
    const firstDay = dateKeys[0]!;
    const lastDay = dateKeys[dateKeys.length - 1]!;

    const [appointments, plan, settings] = await Promise.all([
      columnIds.length === 0
        ? Promise.resolve([] as AppointmentRow[])
        : this.prisma.appointment.findMany({
            where: {
              tenantId,
              barberId: { in: columnIds },
              startsAt: {
                gte: zonedTimeToUtc(firstDay, 0, timezone),
                lt: zonedTimeToUtc(addDays(lastDay, 1), 0, timezone),
              },
            },
            include: APPOINTMENT_INCLUDE,
            orderBy: { startsAt: 'asc' },
          }),
      this.loadDayPlanInputs(tenantId, columnIds, firstDay, lastDay),
      this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { slotIntervalMin: true },
      }),
    ]);

    const noShowByClient = await this.noShowCountsFor(tenantId, appointments);

    const byKey = new Map<string, StaffAppointmentItem[]>();
    for (const appointment of appointments) {
      const dateKey = toDateKey(appointment.startsAt, timezone);
      const key = `${appointment.barberId}|${dateKey}`;
      const bucket = byKey.get(key) ?? [];
      bucket.push(toItem(appointment, noShowByClient));
      byKey.set(key, bucket);
    }

    const days = dateKeys.map((dateKey) => ({
      date: dateKey,
      weekday: weekdayOf(dateKey),
      barbers: columns.map((barber): StaffAgendaBarberColumn => {
        const shift = this.shiftOf(plan, barber.id, dateKey);
        return {
          barberId: barber.id,
          barberName: barber.name,
          avatarUrl: barber.avatarUrl,
          appointments: byKey.get(`${barber.id}|${dateKey}`) ?? [],
          workStartMinutes: shift.workStart,
          workEndMinutes: shift.workEnd,
          lunchStartMinutes: shift.lunchStart,
          lunchEndMinutes: shift.lunchEnd,
          blocks: shift.blocks,
        };
      }),
    }));

    return {
      timezone,
      view: query.view,
      days,
      barberOptions,
      ...gridBounds(days, plan, dateKeys, appointments, timezone),
      slotIntervalMinutes: settings?.slotIntervalMin ?? DEFAULT_SLOT_INTERVAL,
    };
  }

  /**
   * Visão de Mês — uma célula por dia com a contagem e a taxa de ocupação.
   *
   * Rota própria e não mais um `view` de `getAgenda` porque o formato é outro:
   * 31 dias × N barbeiros de agendamento completo seriam centenas de KB para
   * desenhar um número e uma barrinha por dia.
   */
  async getMonth(
    tenantId: string,
    timezone: string,
    query: { date: string; barberIds?: string[] },
    scope: StaffScope,
  ): Promise<StaffAgendaMonthResponse> {
    if (!isValidDateKey(query.date)) {
      throw ApiException.badRequest('Data inválida.');
    }

    const [yearText, monthText] = query.date.split('-') as [string, string, string];
    const year = Number(yearText);
    const month = Number(monthText);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstDay = `${yearText}-${monthText}-01` as DateKey;
    const lastDay = `${yearText}-${monthText}-${String(daysInMonth).padStart(2, '0')}` as DateKey;

    const allBarbers = await this.prisma.barber.findMany({
      where: { tenantId, deletedAt: null, active: true },
      select: { id: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const columnIds = scope.forcedBarberId
      ? allBarbers.filter((barber) => barber.id === scope.forcedBarberId).map((barber) => barber.id)
      : query.barberIds && query.barberIds.length > 0
        ? allBarbers.filter((barber) => query.barberIds!.includes(barber.id)).map((barber) => barber.id)
        : allBarbers.map((barber) => barber.id);

    const [appointments, plan] = await Promise.all([
      columnIds.length === 0
        ? Promise.resolve([] as Array<{ barberId: string; startsAt: Date; endsAt: Date }>)
        : this.prisma.appointment.findMany({
            where: {
              tenantId,
              barberId: { in: columnIds },
              // Cancelado e falta devolvem o horário à grade — não ocupam nada.
              status: { notIn: [AppointmentStatus.CANCELED, AppointmentStatus.NO_SHOW] },
              startsAt: {
                gte: zonedTimeToUtc(firstDay, 0, timezone),
                lt: zonedTimeToUtc(addDays(lastDay, 1), 0, timezone),
              },
            },
            select: { barberId: true, startsAt: true, endsAt: true },
          }),
      this.loadDayPlanInputs(tenantId, columnIds, firstDay, lastDay),
    ]);

    const bookedByDay = new Map<string, { count: number; minutes: number }>();
    for (const appointment of appointments) {
      const dateKey = toDateKey(appointment.startsAt, timezone);
      const bucket = bookedByDay.get(dateKey) ?? { count: 0, minutes: 0 };
      bucket.count += 1;
      bucket.minutes += Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000);
      bookedByDay.set(dateKey, bucket);
    }

    const today = toDateKey(new Date(), timezone);
    const cells: StaffAgendaMonthCell[] = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${yearText}-${monthText}-${String(day).padStart(2, '0')}` as DateKey;
      const booked = bookedByDay.get(dateKey) ?? { count: 0, minutes: 0 };

      const capacity = columnIds.reduce((total, barberId) => {
        const shift = this.shiftOf(plan, barberId, dateKey);
        return total + openMinutesOf(shift);
      }, 0);

      cells.push({
        date: dateKey,
        day,
        appointmentCount: booked.count,
        occupancyPct: capacity > 0 ? Math.min(100, Math.round((booked.minutes / capacity) * 100)) : 0,
        isToday: dateKey === today,
      });
    }

    return {
      timezone,
      month: `${yearText}-${monthText}`,
      // A grade do protótipo começa na segunda-feira.
      leadingBlanks: (weekdayOf(firstDay) + 6) % 7,
      cells,
    };
  }

  /**
   * Grade de horários do modal "Novo agendamento".
   *
   * Devolve TODOS os horários do expediente do barbeiro, marcando quais estão
   * livres — o protótipo desenha os ocupados riscados, e uma lista só com os
   * livres esconderia do balcão a informação de que o horário existe e está
   * tomado.
   *
   * A disponibilidade vem do mesmo `AvailabilityService` que o `POST` valida,
   * com o mesmo `now: new Date(0)`: o que aparece clicável é exatamente o que
   * o servidor aceita, sem uma segunda regra para divergir.
   */
  async getSlots(
    tenantId: string,
    timezone: string,
    query: { date: string; barberId: string; serviceIds: string[]; ignoreAppointmentId?: string },
    scope: StaffScope,
  ): Promise<StaffAgendaSlotsResponse> {
    if (!isValidDateKey(query.date)) {
      throw ApiException.badRequest('Data inválida.');
    }
    this.scopes.assertAllowed(scope, query.barberId);

    const resolved = await this.catalog.resolveSelection(tenantId, query.serviceIds, null);
    const serviceIds = resolved.services.map((service) => service.id);
    const totalDurationMin = resolved.services.reduce((total, service) => total + service.durationMin, 0);

    const [availability, plan, settings, ignored] = await Promise.all([
      this.availability.getAvailability({
        tenantId,
        timezone,
        serviceIds,
        totalDurationMin,
        barberId: query.barberId,
        fromDate: query.date,
        selectedDate: query.date,
        days: 1,
        now: new Date(0),
      }),
      this.loadDayPlanInputs(tenantId, [query.barberId], query.date, query.date),
      this.prisma.tenantSettings.findUnique({ where: { tenantId }, select: { slotIntervalMin: true } }),
      query.ignoreAppointmentId
        ? this.prisma.appointment.findFirst({
            where: { id: query.ignoreAppointmentId, tenantId, barberId: query.barberId },
            select: { startsAt: true },
          })
        : Promise.resolve(null),
    ]);

    const freeStarts = new Set(
      availability.slots
        .filter((slot) => slot.barberIds.includes(query.barberId))
        .map((slot) => slot.startsAt),
    );
    // Remarcar não pode esconder o horário atual do agendamento.
    if (ignored) {
      freeStarts.add(ignored.startsAt.toISOString());
    }

    const shift = this.shiftOf(plan, query.barberId, query.date);
    if (shift.workStart === null || shift.workEnd === null || totalDurationMin <= 0) {
      return { timezone, date: query.date, totalDurationMin, slots: [] };
    }

    const interval = settings?.slotIntervalMin ?? DEFAULT_SLOT_INTERVAL;
    const first = Math.ceil(shift.workStart / interval) * interval;
    const slots: StaffAgendaSlot[] = [];

    for (let minute = first; minute + totalDurationMin <= shift.workEnd; minute += interval) {
      const startsAt = zonedTimeToUtc(query.date, minute, timezone);
      slots.push({
        time: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
        startsAt: startsAt.toISOString(),
        available: freeStarts.has(startsAt.toISOString()),
        period: periodOfMinutes(minute),
      });
    }

    return { timezone, date: query.date, totalDurationMin, slots };
  }

  /** Detalhe do drawer: o agendamento + as últimas visitas do cliente. */
  async getDetail(
    tenantId: string,
    timezone: string,
    appointmentId: string,
    scope: StaffScope,
  ): Promise<StaffAppointmentDetail> {
    const appointment = await this.loadOwned(tenantId, appointmentId);
    this.scopes.assertAllowed(scope, appointment.barberId);

    const noShowByClient = await this.noShowCountsFor(tenantId, [appointment]);

    const history = appointment.clientId
      ? await this.prisma.appointment.findMany({
          where: {
            tenantId,
            clientId: appointment.clientId,
            status: AppointmentStatus.DONE,
            id: { not: appointment.id },
          },
          include: APPOINTMENT_INCLUDE,
          orderBy: { startsAt: 'desc' },
          take: HISTORY_SIZE,
        })
      : [];

    return {
      appointment: toItem(appointment, noShowByClient),
      history: history.map((visit) => ({
        date: toDateKey(visit.startsAt, timezone),
        serviceName: [...visit.services]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((line) => line.service.name)
          .join(' + '),
        totalPriceCents: visit.priceCents,
      })),
    };
  }

  async create(
    tenantId: string,
    timezone: string,
    dto: CreateStaffAppointmentDto,
    scope: StaffScope,
    actorUserId: string,
    request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    this.scopes.assertAllowed(scope, dto.barberId);

    if (!dto.clientId === !dto.walkIn) {
      throw ApiException.badRequest('Informe um cliente cadastrado OU os dados do walk-in — nunca os dois.');
    }

    const barber = await this.prisma.barber.findFirst({
      where: { id: dto.barberId, tenantId, deletedAt: null, active: true },
      // `unitId` sai daqui: a unidade do agendamento é a do profissional que o
      // atende. Sem gravá-la, o filtro por unidade dos Relatórios não encontra
      // nenhum agendamento — `Appointment.unitId` nascia sempre nulo.
      select: { id: true, unitId: true },
    });
    if (!barber) {
      throw ApiException.badRequest('Barbeiro inválido.');
    }

    let clientId: string | null = null;
    let clientPhone: string | null = null;
    let guestName: string | null = null;
    let guestPhone: string | null = null;

    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, deletedAt: null },
        select: { id: true, phone: true },
      });
      if (!client) {
        throw ApiException.badRequest('Cliente não encontrado.');
      }
      clientId = client.id;
      clientPhone = client.phone;
    } else if (dto.walkIn) {
      const name = dto.walkIn.name.trim();
      if (!name) {
        throw ApiException.badRequest('Informe o nome do cliente.');
      }
      guestName = name;
      guestPhone = normalizeMobilePhone(dto.walkIn.phone) ?? dto.walkIn.phone;
    }

    const resolved = await this.catalog.resolveSelection(tenantId, dto.serviceIds, clientId);
    const serviceIds = resolved.services.map((service) => service.id);
    const durationMin = resolved.services.reduce((total, service) => total + service.durationMin, 0);
    const startsAt = new Date(dto.startsAt);

    await this.assertSlotBookable(tenantId, timezone, { serviceIds, barberId: dto.barberId, startsAt });

    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

    const created = await this.runGuardingDoubleBooking(() =>
      this.prisma.$transaction(async (tx) => {
        const lines: Array<{ serviceId: string; priceCents: number; durationMin: number; usageId: string | null }> = [];

        for (const service of resolved.services) {
          const covered = resolved.coverage.get(service.id);
          let usageId: string | null = null;
          if (covered && !covered.exhausted) {
            usageId = (await this.coverage.debit(tx, covered.usageId)) ? covered.usageId : null;
          }
          lines.push({
            serviceId: service.id,
            priceCents: usageId ? 0 : service.priceCents,
            durationMin: service.durationMin,
            usageId,
          });
        }

        const appointment = await this.insertWithUniqueCode(tx, (bookingCode) => ({
          tenantId,
          bookingCode,
          barberId: dto.barberId,
          unitId: barber.unitId,
          serviceId: lines[0]!.serviceId,
          clientId,
          guestName,
          guestPhone,
          startsAt,
          endsAt,
          status: AppointmentStatus.SCHEDULED,
          origin: AppointmentOrigin.DASHBOARD,
          priceCents: lines.reduce((total, line) => total + line.priceCents, 0),
          notes: dto.notes?.slice(0, 500) ?? null,
          subscriptionUsageId: lines.find((line) => line.usageId)?.usageId ?? null,
          services: {
            create: lines.map((line, index) => ({
              tenantId,
              serviceId: line.serviceId,
              sortOrder: index,
              priceCents: line.priceCents,
              durationMin: line.durationMin,
              subscriptionUsageId: line.usageId,
            })),
          },
        }));

        if (clientId && clientPhone) {
          await tx.clientProfile.upsert({
            where: { tenantId_clientId: { tenantId, clientId } },
            create: { tenantId, clientId, phone: clientPhone, firstVisitAt: new Date() },
            update: { phone: clientPhone },
          });
        }

        return appointment;
      }),
    );

    await this.audit.record(
      {
        action: AuditAction.STAFF_APPOINTMENT_CREATED,
        entity: 'Appointment',
        entityId: created.id,
        tenantId,
        actorUserId,
        metadata: { barberId: dto.barberId, walkIn: !clientId },
      },
      request,
    );

    // Toggle "Enviar confirmação por WhatsApp" do modal — ligado por padrão,
    // como no protótipo. O envio reusa o MESMO caminho do booking público
    // (templates do tenant + lembretes agendados) e nunca derruba a criação.
    if (dto.notifyWhatsapp !== false) {
      await this.notifyCreated(tenantId, timezone, created);
    }

    return toItem(created, await this.noShowCountsFor(tenantId, [created]));
  }

  async move(
    tenantId: string,
    timezone: string,
    appointmentId: string,
    dto: MoveStaffAppointmentDto,
    scope: StaffScope,
    actorUserId: string,
    request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const appointment = await this.loadOwned(tenantId, appointmentId);
    this.scopes.assertAllowed(scope, appointment.barberId);
    if (dto.barberId) {
      this.scopes.assertAllowed(scope, dto.barberId);
    }
    this.assertChangeable(appointment);

    const serviceIds = appointment.services.map((line) => line.serviceId);
    const durationMin = appointment.services.reduce((total, line) => total + line.durationMin, 0);
    const barberId = dto.barberId ?? appointment.barberId;
    const startsAt = new Date(dto.startsAt);

    await this.assertSlotBookable(tenantId, timezone, {
      serviceIds,
      barberId,
      startsAt,
      ignoreAppointmentId: appointment.id,
    });

    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
    // Trocar de profissional pode trocar de unidade: a do agendamento
    // acompanha a de quem passa a atendê-lo.
    const unitId =
      dto.barberId && dto.barberId !== appointment.barberId
        ? ((
            await this.prisma.barber.findFirst({
              where: { id: barberId, tenantId },
              select: { unitId: true },
            })
          )?.unitId ?? null)
        : appointment.unitId;

    const updated = await this.runGuardingDoubleBooking(() =>
      this.prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          startsAt,
          endsAt,
          barberId,
          unitId,
          status: AppointmentStatus.SCHEDULED,
          confirmedAt: null,
        },
        include: APPOINTMENT_INCLUDE,
      }),
    );

    await this.audit.record(
      {
        action: AuditAction.STAFF_APPOINTMENT_MOVED,
        entity: 'Appointment',
        entityId: updated.id,
        tenantId,
        actorUserId,
        metadata: { from: appointment.startsAt.toISOString(), to: startsAt.toISOString() },
      },
      request,
    );

    return toItem(updated, await this.noShowCountsFor(tenantId, [updated]));
  }

  async cancel(
    tenantId: string,
    appointmentId: string,
    dto: CancelStaffAppointmentDto,
    scope: StaffScope,
    actorUserId: string,
    request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const appointment = await this.loadOwned(tenantId, appointmentId);
    this.scopes.assertAllowed(scope, appointment.barberId);
    this.assertChangeable(appointment);

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of appointment.services) {
        if (line.subscriptionUsageId) {
          await this.coverage.refund(tx, line.subscriptionUsageId);
        }
      }
      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.CANCELED,
          canceledAt: new Date(),
          cancelReason: dto.reason?.slice(0, 240) ?? 'Cancelado pela barbearia',
        },
        include: APPOINTMENT_INCLUDE,
      });
    });

    await this.audit.record(
      {
        action: AuditAction.STAFF_APPOINTMENT_CANCELED,
        entity: 'Appointment',
        entityId: updated.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return toItem(updated, await this.noShowCountsFor(tenantId, [updated]));
  }

  /**
   * Confirma um agendamento pelo balcão.
   *
   * Existe porque o menu ⋯ dos "Próximos atendimentos" do Dashboard oferece
   * "Confirmar" e não havia rota para isso: até a fase 13, `CONFIRMED` só era
   * alcançável pelo cliente, no canal público. Confirmar de novo é idempotente
   * — o balcão clica duas vezes o tempo todo, e um 409 aí seria ruído.
   */
  async confirm(
    tenantId: string,
    appointmentId: string,
    scope: StaffScope,
    actorUserId: string,
    request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const appointment = await this.loadOwned(tenantId, appointmentId);
    this.scopes.assertAllowed(scope, appointment.barberId);

    if (appointment.status === AppointmentStatus.CONFIRMED) {
      return toItem(appointment, await this.noShowCountsFor(tenantId, [appointment]));
    }
    this.assertChangeable(appointment);

    const updated = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CONFIRMED, confirmedAt: new Date() },
      include: APPOINTMENT_INCLUDE,
    });

    await this.audit.record(
      {
        action: AuditAction.STAFF_APPOINTMENT_CONFIRMED,
        entity: 'Appointment',
        entityId: updated.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return toItem(updated, await this.noShowCountsFor(tenantId, [updated]));
  }

  /**
   * "Marcar falta" do drawer.
   *
   * Além do status, incrementa `ClientProfile.noShowCount` e aplica o bloqueio
   * automático de `TenantSettings.bloquearFaltasQtd` — é esse contador que
   * acende o ⚠ da grade nas próximas visitas do cliente.
   *
   * Diferente de `cancel`, NÃO devolve o crédito de assinatura: quem não
   * apareceu consumiu a vaga da agenda, e devolver o crédito transformaria a
   * falta em cancelamento gratuito.
   */
  async markNoShow(
    tenantId: string,
    appointmentId: string,
    scope: StaffScope,
    actorUserId: string,
    request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const appointment = await this.loadOwned(tenantId, appointmentId);
    this.scopes.assertAllowed(scope, appointment.barberId);
    this.assertChangeable(appointment);

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { bloquearFaltasAtivo: true, bloquearFaltasQtd: true },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: AppointmentStatus.NO_SHOW },
        include: APPOINTMENT_INCLUDE,
      });

      if (appointment.clientId) {
        const profile = await tx.clientProfile.update({
          where: { tenantId_clientId: { tenantId, clientId: appointment.clientId } },
          data: { noShowCount: { increment: 1 } },
          select: { id: true, noShowCount: true, blocked: true },
        });

        const limit = settings?.bloquearFaltasQtd ?? 0;
        if (settings?.bloquearFaltasAtivo && limit > 0 && profile.noShowCount >= limit && !profile.blocked) {
          await tx.clientProfile.update({ where: { id: profile.id }, data: { blocked: true } });
        }
      }

      return row;
    });

    await this.audit.record(
      {
        action: AuditAction.STAFF_APPOINTMENT_NO_SHOW,
        entity: 'Appointment',
        entityId: updated.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    const noShowByClient = await this.noShowCountsFor(tenantId, [updated]);
    return toItem(updated, noShowByClient);
  }

  /**
   * "Bloquear horário" — almoço estendido, folga, manutenção.
   *
   * Grava um `ScheduleException` do tipo `BLOCK`, que o `AvailabilityService`
   * subtrai do expediente. É o mesmo registro de folga/férias da aba Equipe,
   * de propósito: um bloqueio criado aqui fecha a grade pública também.
   */
  async createBlock(
    tenantId: string,
    dto: CreateStaffAgendaBlockDto,
    scope: StaffScope,
    actorUserId: string,
    request: RequestContext,
  ): Promise<StaffAgendaBlockItemRow> {
    // `BARBER` só bloqueia a própria agenda — inclusive não pode escolher
    // "Todos", que fecharia a casa inteira.
    const barberId = scope.forcedBarberId ?? dto.barberId ?? null;
    if (scope.forcedBarberId && dto.barberId && dto.barberId !== scope.forcedBarberId) {
      throw ApiException.forbidden('Você só pode bloquear a própria agenda.');
    }
    if (scope.forcedBarberId === null && barberId) {
      const barber = await this.prisma.barber.findFirst({
        where: { id: barberId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!barber) {
        throw ApiException.badRequest('Barbeiro inválido.');
      }
    }

    if (!isValidDateKey(dto.startDate) || !isValidDateKey(dto.endDate)) {
      throw ApiException.badRequest('Data inválida.');
    }
    if (dto.endDate < dto.startDate) {
      throw ApiException.badRequest('A data de fim não pode ser anterior à de início.');
    }

    const hasStart = Boolean(dto.startTime);
    const hasEnd = Boolean(dto.endTime);
    if (hasStart !== hasEnd) {
      throw ApiException.badRequest('Informe as duas horas, ou nenhuma para bloquear o dia inteiro.');
    }

    const startMinutes = hasStart ? timeToMinutes(dto.startTime!) : null;
    const endMinutes = hasEnd ? timeToMinutes(dto.endTime!) : null;
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      throw ApiException.badRequest('A hora de fim precisa ser maior que a de início.');
    }

    const created = await this.prisma.scheduleException.create({
      data: {
        tenantId,
        barberId,
        startDate: dateKeyToUtcMidnight(dto.startDate),
        endDate: dateKeyToUtcMidnight(dto.endDate),
        type: ScheduleExceptionType.BLOCK,
        startTime: startMinutes,
        endTime: endMinutes,
        reason: dto.reason.slice(0, 60),
        notes: dto.notes?.slice(0, 240) ?? null,
      },
    });

    await this.audit.record(
      {
        action: AuditAction.STAFF_AGENDA_BLOCK_CREATED,
        entity: 'ScheduleException',
        entityId: created.id,
        tenantId,
        actorUserId,
        metadata: { barberId, startDate: dto.startDate, endDate: dto.endDate, reason: created.reason },
      },
      request,
    );

    return toBlockItem(created);
  }

  async deleteBlock(
    tenantId: string,
    blockId: string,
    scope: StaffScope,
    actorUserId: string,
    request: RequestContext,
  ): Promise<void> {
    const block = await this.prisma.scheduleException.findFirst({
      where: { id: blockId, tenantId, type: ScheduleExceptionType.BLOCK },
      select: { id: true, barberId: true },
    });
    if (!block) {
      throw ApiException.notFound('Bloqueio não encontrado.');
    }
    // Bloqueio da casa inteira (`barberId` nulo) não é do barbeiro para tirar.
    if (scope.forcedBarberId && block.barberId !== scope.forcedBarberId) {
      throw ApiException.forbidden('Você só pode liberar bloqueios da própria agenda.');
    }

    await this.prisma.scheduleException.delete({ where: { id: block.id } });

    await this.audit.record(
      {
        action: AuditAction.STAFF_AGENDA_BLOCK_DELETED,
        entity: 'ScheduleException',
        entityId: block.id,
        tenantId,
        actorUserId,
      },
      request,
    );
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  /**
   * Escalas, exceções e horário da casa do período — tudo que decide onde a
   * coluna começa, onde termina, onde fica o almoço e o que está bloqueado.
   */
  private async loadDayPlanInputs(
    tenantId: string,
    barberIds: string[],
    firstDay: DateKey,
    lastDay: DateKey,
  ): Promise<DayPlanInputs> {
    if (barberIds.length === 0) {
      return { schedules: new Map(), exceptions: [], business: new Map() };
    }

    const [schedules, exceptions, businessHours] = await Promise.all([
      this.prisma.workSchedule.findMany({
        where: { tenantId, barberId: { in: barberIds } },
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
          tenantId,
          OR: [{ barberId: { in: barberIds } }, { barberId: null }],
          startDate: { lte: dateKeyToUtcMidnight(lastDay) },
          endDate: { gte: dateKeyToUtcMidnight(firstDay) },
        },
        select: {
          id: true,
          barberId: true,
          startDate: true,
          endDate: true,
          type: true,
          startTime: true,
          endTime: true,
          reason: true,
        },
      }),
      this.prisma.tenantBusinessHour.findMany({
        where: { tenantId },
        select: {
          weekday: true,
          opensAt: true,
          closesAt: true,
          closed: true,
          lunchStart: true,
          lunchEnd: true,
        },
      }),
    ]);

    return {
      schedules: new Map(schedules.map((row) => [`${row.barberId}:${row.weekday}`, row])),
      exceptions,
      business: new Map(businessHours.map((row) => [row.weekday, row])),
    };
  }

  /**
   * Expediente do barbeiro naquele dia. Mesma ordem de precedência do
   * `AvailabilityService.planFor` — folga/férias/feriado zeram o dia,
   * `CUSTOM_HOURS` redefine, o horário da casa recorta e `BLOCK` subtrai.
   */
  private shiftOf(plan: DayPlanInputs, barberId: string, dateKey: DateKey): Shift {
    const empty: Shift = {
      workStart: null,
      workEnd: null,
      lunchStart: null,
      lunchEnd: null,
      blocks: [],
    };

    const weekday = weekdayOf(dateKey);
    const schedule = plan.schedules.get(`${barberId}:${weekday}`);
    const business = plan.business.get(weekday);

    if (!schedule || schedule.isDayOff || (business && business.closed)) {
      return empty;
    }

    const mine = plan.exceptions.filter(
      (exception) =>
        (exception.barberId === barberId || exception.barberId === null) &&
        utcDateToKey(exception.startDate) <= dateKey &&
        utcDateToKey(exception.endDate) >= dateKey,
    );

    const closesDay = mine.some(
      (exception) =>
        exception.type !== ScheduleExceptionType.CUSTOM_HOURS &&
        (exception.type !== ScheduleExceptionType.BLOCK ||
          exception.startTime === null ||
          exception.endTime === null),
    );
    if (closesDay) {
      return empty;
    }

    const custom = mine.find((exception) => exception.type === ScheduleExceptionType.CUSTOM_HOURS);
    let start = custom?.startTime ?? schedule.startTime;
    let end = custom?.endTime ?? schedule.endTime;

    if (business && !business.closed) {
      start = Math.max(start, business.opensAt);
      end = Math.min(end, business.closesAt);
    }
    if (end <= start) {
      return empty;
    }

    const blocks: StaffAgendaBlock[] = mine
      .filter(
        (exception) =>
          exception.type === ScheduleExceptionType.BLOCK &&
          exception.startTime !== null &&
          exception.endTime !== null,
      )
      .map((exception) => ({
        id: exception.id,
        startMinutes: Math.max(start, exception.startTime!),
        endMinutes: Math.min(end, exception.endTime!),
        reason: exception.reason,
        wholeShop: exception.barberId === null,
      }))
      .filter((block) => block.endMinutes > block.startMinutes);

    // O almoço da CASA (agente 26) entra como bloqueio da barbearia inteira:
    // quando a barbearia fecha ao meio-dia, o balcão não pode agendar ali —
    // nem para um barbeiro cujo `WorkSchedule` almoça em outro horário. O id é
    // sintético de propósito: é uma faixa desenhada, não uma
    // `ScheduleException` que alguém possa apagar da grade.
    if (
      business &&
      business.lunchStart !== null &&
      business.lunchEnd !== null &&
      business.lunchEnd > start &&
      business.lunchStart < end
    ) {
      blocks.push({
        id: `house-lunch:${dateKey}`,
        startMinutes: Math.max(start, business.lunchStart),
        endMinutes: Math.min(end, business.lunchEnd),
        reason: 'Almoço da barbearia',
        wholeShop: true,
      });
    }

    const lunchInside =
      schedule.lunchStart !== null &&
      schedule.lunchEnd !== null &&
      schedule.lunchEnd > start &&
      schedule.lunchStart < end;

    return {
      workStart: start,
      workEnd: end,
      lunchStart: lunchInside ? Math.max(start, schedule.lunchStart!) : null,
      lunchEnd: lunchInside ? Math.min(end, schedule.lunchEnd!) : null,
      blocks,
    };
  }

  /**
   * Faltas acumuladas por cliente — o ⚠ "Cliente com 2+ faltas" do protótipo.
   * Uma consulta para o lote inteiro; walk-in não tem perfil e conta zero.
   */
  private async noShowCountsFor(
    tenantId: string,
    appointments: Array<{ clientId: string | null }>,
  ): Promise<Map<string, number>> {
    const clientIds = [
      ...new Set(appointments.map((row) => row.clientId).filter((id): id is string => id !== null)),
    ];
    if (clientIds.length === 0) {
      return new Map();
    }

    const profiles = await this.prisma.clientProfile.findMany({
      where: { tenantId, clientId: { in: clientIds } },
      select: { clientId: true, noShowCount: true },
    });

    return new Map(profiles.map((profile) => [profile.clientId, profile.noShowCount]));
  }

  /** Monta o contexto de mensagem e delega ao mesmo serviço do booking. */
  private async notifyCreated(
    tenantId: string,
    timezone: string,
    appointment: AppointmentRow,
  ): Promise<void> {
    const phone = appointment.client?.phone ?? appointment.guestPhone;
    if (!phone) {
      return;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { name: true, slug: true },
    });
    if (!tenant) {
      return;
    }

    await this.notifications.onAppointmentCreated({
      tenantId,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      timezone,
      appointmentId: appointment.id,
      bookingCode: appointment.bookingCode,
      recipientPhone: phone,
      clientName: appointment.client?.name ?? appointment.guestName ?? 'Cliente',
      barberName: appointment.barber.name,
      serviceNames: [...appointment.services]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((line) => line.service.name),
      startsAt: appointment.startsAt,
    });
  }

  private async loadOwned(tenantId: string, id: string): Promise<AppointmentRow> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) {
      throw ApiException.notFound('Agendamento não encontrado.');
    }
    return appointment;
  }

  private assertChangeable(appointment: AppointmentRow): void {
    if (
      appointment.status === AppointmentStatus.CANCELED ||
      appointment.status === AppointmentStatus.DONE ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      throw ApiException.conflict('Este agendamento não pode mais ser alterado.');
    }
  }

  /**
   * Mesma checagem de `AppointmentsService.assertSlotIsBookable` (fase 04),
   * mas com `now: new Date(0)` — desliga `antecedenciaMinima` e o corte "só no
   * futuro", que são fricção pensada para o cliente anônimo, não para o staff
   * lançando um walk-in que já está sentado na cadeira.
   */
  private async assertSlotBookable(
    tenantId: string,
    timezone: string,
    input: { serviceIds: string[]; barberId: string; startsAt: Date; ignoreAppointmentId?: string },
  ): Promise<void> {
    const dateKey = toDateKey(input.startsAt, timezone);

    const services = await this.prisma.service.findMany({
      where: { tenantId, id: { in: input.serviceIds }, active: true, deletedAt: null },
      select: { durationMin: true },
    });
    if (services.length !== input.serviceIds.length) {
      throw ApiException.badRequest('Serviço indisponível nesta barbearia.');
    }

    const availability = await this.availability.getAvailability({
      tenantId,
      timezone,
      serviceIds: input.serviceIds,
      totalDurationMin: services.reduce((total, service) => total + service.durationMin, 0),
      barberId: input.barberId,
      fromDate: dateKey,
      selectedDate: dateKey,
      days: 1,
      now: new Date(0),
    });

    const wanted = input.startsAt.toISOString();
    const bookable = availability.slots.some(
      (slot) => slot.startsAt === wanted && slot.barberIds.includes(input.barberId),
    );
    if (bookable) {
      return;
    }

    if (input.ignoreAppointmentId) {
      const self = await this.prisma.appointment.findFirst({
        where: {
          id: input.ignoreAppointmentId,
          tenantId,
          startsAt: input.startsAt,
          barberId: input.barberId,
        },
        select: { id: true },
      });
      if (self) {
        return;
      }
    }

    throw new ApiException(HttpStatus.CONFLICT, {
      code: ErrorCode.DOUBLE_BOOKING,
      message: 'Esse horário não está disponível para este barbeiro.',
    });
  }

  private async insertWithUniqueCode(
    tx: Prisma.TransactionClient,
    build: (bookingCode: string) => Prisma.AppointmentUncheckedCreateInput,
  ): Promise<AppointmentRow> {
    for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
      try {
        return await tx.appointment.create({ data: build(generateBookingCode()), include: APPOINTMENT_INCLUDE });
      } catch (error) {
        const collided =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          String(error.meta?.['target'] ?? '').includes('bookingCode');
        if (!collided || attempt === CODE_ATTEMPTS) {
          throw error;
        }
      }
    }
    throw ApiException.conflict('Não foi possível gerar o código da reserva.');
  }

  private async runGuardingDoubleBooking<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ApiException(HttpStatus.CONFLICT, {
          code: ErrorCode.DOUBLE_BOOKING,
          message: 'Esse horário acabou de ser ocupado. Escolha outro na grade atualizada.',
        });
      }
      throw error;
    }
  }
}

/** `HH:MM` → minutos desde a meia-noite. O DTO já validou o formato. */
function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

function toBlockItem(row: {
  id: string;
  barberId: string | null;
  startDate: Date;
  endDate: Date;
  startTime: number | null;
  endTime: number | null;
  reason: string | null;
}): StaffAgendaBlockItemRow {
  return {
    id: row.id,
    barberId: row.barberId,
    startDate: utcDateToKey(row.startDate),
    endDate: utcDateToKey(row.endDate),
    startMinutes: row.startTime,
    endMinutes: row.endTime,
    reason: row.reason,
  };
}

/** Minutos realmente atendíveis do turno — expediente menos almoço e bloqueios. */
function openMinutesOf(shift: Shift): number {
  if (shift.workStart === null || shift.workEnd === null) {
    return 0;
  }

  let windows = [{ start: shift.workStart, end: shift.workEnd }];
  if (shift.lunchStart !== null && shift.lunchEnd !== null) {
    windows = subtractWindow(windows, { start: shift.lunchStart, end: shift.lunchEnd });
  }
  for (const block of shift.blocks) {
    windows = subtractWindow(windows, { start: block.startMinutes, end: block.endMinutes });
  }

  return windows.reduce((total, window) => total + (window.end - window.start), 0);
}

/**
 * Limites verticais da grade.
 *
 * O protótipo cravava 08:00–20:00; aqui a régua nasce do expediente real das
 * colunas exibidas. Quando ninguém trabalha no período (folga coletiva, tenant
 * recém-criado), recua para o horário da casa e, na falta dele, para a
 * extensão dos próprios agendamentos — nunca para um número inventado. Se não
 * houver nem isso, devolve uma faixa vazia e o front mostra o estado vazio.
 */
function gridBounds(
  days: Array<{ barbers: StaffAgendaBarberColumn[] }>,
  plan: DayPlanInputs,
  dateKeys: DateKey[],
  appointments: Array<{ startsAt: Date; endsAt: Date }>,
  timezone: string,
): { gridStartMinutes: number; gridEndMinutes: number } {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;

  for (const day of days) {
    for (const column of day.barbers) {
      if (column.workStartMinutes === null || column.workEndMinutes === null) continue;
      start = Math.min(start, column.workStartMinutes);
      end = Math.max(end, column.workEndMinutes);
    }
  }

  if (start === Number.POSITIVE_INFINITY) {
    for (const dateKey of dateKeys) {
      const business = plan.business.get(weekdayOf(dateKey));
      if (!business || business.closed) continue;
      start = Math.min(start, business.opensAt);
      end = Math.max(end, business.closesAt);
    }
  }

  // Um agendamento fora do expediente (lançado à mão, escala mudou depois)
  // não pode ficar invisível: a régua estica para caber.
  for (const appointment of appointments) {
    const from = toMinutesOfDay(appointment.startsAt, timezone);
    const to = from + Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000);
    start = Math.min(start === Number.POSITIVE_INFINITY ? from : start, from);
    end = Math.max(end === Number.NEGATIVE_INFINITY ? to : end, to);
  }

  if (start === Number.POSITIVE_INFINITY || end <= start) {
    return { gridStartMinutes: 0, gridEndMinutes: 0 };
  }

  // Fecha na hora cheia dos dois lados — a régua do protótipo só rotula horas.
  return {
    gridStartMinutes: Math.max(0, Math.floor(start / 60) * 60),
    gridEndMinutes: Math.min(24 * 60, Math.ceil(end / 60) * 60),
  };
}

/** Semana de segunda a domingo contendo `dateKey`. */
function weekDates(dateKey: DateKey): DateKey[] {
  const weekday = weekdayOf(dateKey); // 0 = domingo
  const offsetFromMonday = (weekday + 6) % 7;
  const monday = addDays(dateKey, -offsetFromMonday);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function toItem(
  appointment: AppointmentRow,
  noShowByClient: Map<string, number>,
): StaffAppointmentItem {
  const lines = [...appointment.services].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: appointment.id,
    bookingCode: appointment.bookingCode,
    status: appointment.status,
    origin: appointment.origin,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    barberId: appointment.barberId,
    barberName: appointment.barber.name,
    clientId: appointment.client?.id ?? null,
    clientName: appointment.client?.name ?? appointment.guestName ?? 'Cliente',
    clientPhone: appointment.client?.phone ?? appointment.guestPhone ?? '',
    isWalkIn: !appointment.clientId,
    services: lines.map((line) => ({
      id: line.serviceId,
      name: line.service.name,
      // "Cor na agenda" do catálogo (protótipo l.1993). Vai para a grade como
      // faixa de acento — o TOM do bloco continua sendo o do status, que é
      // como o protótipo desenha a agenda (`STATUS_COLORS`, l.5041).
      color: line.service.color,
      durationMin: line.durationMin,
      priceCents: line.priceCents,
    })),
    totalPriceCents: appointment.priceCents,
    durationMin: lines.reduce((total, line) => total + line.durationMin, 0),
    notes: appointment.notes,
    clientNoShowCount: appointment.clientId ? (noShowByClient.get(appointment.clientId) ?? 0) : 0,
  };
}
