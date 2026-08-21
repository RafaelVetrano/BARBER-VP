import { HttpStatus, Injectable } from '@nestjs/common';
import { AppointmentOrigin, AppointmentStatus, Prisma } from '@prisma/client';
import { AgendaView, ErrorCode, normalizeMobilePhone, type StaffAgendaResponse, type StaffAppointmentItem } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { addDays, isValidDateKey, toDateKey, weekdayOf, zonedTimeToUtc, type DateKey } from '../common/utils/timezone';
import { AvailabilityService } from '../booking/availability.service';
import { CatalogService } from '../booking/catalog.service';
import { SubscriptionCoverageService } from '../booking/subscription-coverage.service';
import { generateBookingCode } from '../booking/booking-code';
import { isExclusionViolation } from '../booking/appointments.service';
import type { CreateStaffAppointmentDto, MoveStaffAppointmentDto, CancelStaffAppointmentDto } from './dto/staff-agenda.dto';
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
      service: { select: { name: true } },
    },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

const CODE_ATTEMPTS = 5;

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
    query: { date: string; view: AgendaView; barberId?: string },
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

    const requestedBarberId = scope.forcedBarberId ?? query.barberId ?? null;
    const columns = requestedBarberId
      ? allBarbers.filter((barber) => barber.id === requestedBarberId)
      : allBarbers;
    const barberOptions = scope.forcedBarberId
      ? allBarbers.filter((barber) => barber.id === scope.forcedBarberId)
      : allBarbers;

    const dateKeys: DateKey[] = query.view === AgendaView.WEEK ? weekDates(query.date) : [query.date];
    const columnIds = columns.map((barber) => barber.id);

    const appointments =
      columnIds.length === 0
        ? []
        : await this.prisma.appointment.findMany({
            where: {
              tenantId,
              barberId: { in: columnIds },
              startsAt: {
                gte: zonedTimeToUtc(dateKeys[0]!, 0, timezone),
                lt: zonedTimeToUtc(addDays(dateKeys[dateKeys.length - 1]!, 1), 0, timezone),
              },
            },
            include: APPOINTMENT_INCLUDE,
            orderBy: { startsAt: 'asc' },
          });

    const byKey = new Map<string, StaffAppointmentItem[]>();
    for (const appointment of appointments) {
      const dateKey = toDateKey(appointment.startsAt, timezone);
      const key = `${appointment.barberId}|${dateKey}`;
      const bucket = byKey.get(key) ?? [];
      bucket.push(toItem(appointment));
      byKey.set(key, bucket);
    }

    const days = dateKeys.map((dateKey) => ({
      date: dateKey,
      weekday: weekdayOf(dateKey),
      barbers: columns.map((barber) => ({
        barberId: barber.id,
        barberName: barber.name,
        avatarUrl: barber.avatarUrl,
        appointments: byKey.get(`${barber.id}|${dateKey}`) ?? [],
      })),
    }));

    return { timezone, view: query.view, days, barberOptions };
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
      select: { id: true },
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

    return toItem(created);
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

    const updated = await this.runGuardingDoubleBooking(() =>
      this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { startsAt, endsAt, barberId, status: AppointmentStatus.SCHEDULED, confirmedAt: null },
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

    return toItem(updated);
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

    return toItem(updated);
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
      return toItem(appointment);
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

    return toItem(updated);
  }

  // ── Internos ──────────────────────────────────────────────────────────────

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

/** Semana de segunda a domingo contendo `dateKey`. */
function weekDates(dateKey: DateKey): DateKey[] {
  const weekday = weekdayOf(dateKey); // 0 = domingo
  const offsetFromMonday = (weekday + 6) % 7;
  const monday = addDays(dateKey, -offsetFromMonday);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function toItem(appointment: AppointmentRow): StaffAppointmentItem {
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
      durationMin: line.durationMin,
      priceCents: line.priceCents,
    })),
    totalPriceCents: appointment.priceCents,
    notes: appointment.notes,
  };
}
