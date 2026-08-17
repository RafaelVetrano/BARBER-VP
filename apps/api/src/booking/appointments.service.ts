import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AppointmentOrigin,
  AppointmentStatus,
  OtpChannel,
  OtpPurpose,
  Prisma,
} from '@prisma/client';
import {
  ErrorCode,
  normalizeMobilePhone,
  type AppointmentSummary,
  type CreateAppointmentResult,
} from '@barbervp/types';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService, type PrismaTransaction } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OtpService } from '../auth/otp/otp.service';
import type { RequestContext } from '../common/types/request-context';
import { addDays, toDateKey, zonedTimeToUtc } from '../common/utils/timezone';
import { AvailabilityService } from './availability.service';
import { CatalogService } from './catalog.service';
import { SubscriptionCoverageService } from './subscription-coverage.service';
import { BookingNotificationsService } from './booking-notifications.service';
import { GuestRiskService } from './guest-risk.service';
import { generateBookingCode, normalizeBookingCode } from './booking-code';

export interface BookingIntent {
  tenantId: string;
  serviceIds: string[];
  barberId: string | null;
  /** ISO/UTC do início escolhido na grade. */
  startsAt: string;
  notes: string | null;
  guestName: string | null;
  guestPhone: string | null;
  clientId: string | null;
}

export interface CreateAppointmentInput {
  tenantId: string;
  serviceIds: string[];
  barberId: string | null;
  startsAt: Date;
  notes?: string | null;
  guest?: { name: string; phone: string } | null;
  clientId: string | null;
  request?: RequestContext;
}

export interface AppointmentIdentityInput {
  tenantId: string;
  bookingCode: string;
  clientId: string | null;
  /** Telefone informado por quem agendou sem conta. */
  phone?: string | null;
}

/** Quantas vezes tentar um código de reserva novo antes de desistir. */
const BOOKING_CODE_ATTEMPTS = 5;

/**
 * Criação, cancelamento e remarcação de agendamento pelo canal público.
 *
 * A regra estrutural desta fase é a EXCLUDE `no_double_booking`: duas pessoas
 * escolhendo o mesmo horário no mesmo segundo é o caso NORMAL numa barbearia
 * com link divulgado, não uma exceção exótica. Validar a grade antes de gravar
 * é cortesia (dá mensagem melhor); quem garante é a constraint, e por isso o
 * erro dela vira 409 com texto amigável em vez de 500.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly coverage: SubscriptionCoverageService,
    private readonly notifications: BookingNotificationsService,
    private readonly guestRisk: GuestRiskService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
  ) {
    this.logger.setContext(AppointmentsService.name);
  }

  // ── Criação ───────────────────────────────────────────────────────────────

  async create(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
    const tenant = await this.loadTenant(input.tenantId);

    if (!tenant.settings.allowOnlineBooking) {
      throw ApiException.forbidden('Esta barbearia não está aceitando agendamento online.');
    }

    const identity = await this.resolveIdentity(tenant, input);

    // Visitante em situação de risco não agenda direto: o agendamento fica
    // guardado no desafio e só nasce quando o código de 6 dígitos bater.
    if (identity.kind === 'guest') {
      const verdict = await this.guestRisk.evaluate({
        tenantId: tenant.id,
        phone: identity.phone,
        ip: input.request?.ip ?? null,
      });

      if (verdict.otpRequired) {
        // Valida ANTES de mandar código: pedir verificação para depois recusar
        // por horário indisponível seria fricção à toa.
        //
        // A checagem usa os ids JÁ resolvidos pelo combo — Corte + Barba ocupa
        // 70 minutos, não os 75 da soma das peças, e conferir a grade contra a
        // duração errada recusaria horários que na verdade cabem.
        const preview = await this.catalog.resolveSelection(tenant.id, input.serviceIds, null);
        await this.assertSlotIsBookable(tenant, {
          ...input,
          serviceIds: preview.services.map((service) => service.id),
        });

        const intent: BookingIntent = {
          tenantId: tenant.id,
          serviceIds: input.serviceIds,
          barberId: input.barberId,
          startsAt: input.startsAt.toISOString(),
          notes: input.notes ?? null,
          guestName: identity.name,
          guestPhone: identity.phone,
          clientId: null,
        };

        const challenge = await this.otp.createChallenge({
          purpose: OtpPurpose.GUEST_BOOKING,
          destination: identity.phone,
          channel: OtpChannel.WHATSAPP,
          payload: intent as unknown as Prisma.InputJsonValue,
          ip: input.request?.ip ?? null,
          recipientName: identity.name,
        });

        this.logger.info(
          { tenantId: tenant.id, reason: verdict.reason },
          'agendamento de visitante exigiu verificação',
        );

        return {
          kind: 'otp-required',
          challengeId: challenge.challengeId,
          destinationMasked: challenge.destinationMasked,
          expiresInSeconds: challenge.expiresInSeconds,
          resendInSeconds: challenge.resendInSeconds,
        };
      }
    }

    const appointment = await this.persist(tenant, input, identity);
    return { kind: 'confirmed', appointment };
  }

  /** Segunda metade do guest booking verificado: o código bateu, agora grava. */
  async confirmGuestBooking(
    challengeId: string,
    code: string,
    request?: RequestContext,
  ): Promise<CreateAppointmentResult> {
    const { challenge } = await this.otp.verify(challengeId, code);

    if (challenge.purpose !== OtpPurpose.GUEST_BOOKING || !challenge.payload) {
      throw ApiException.badRequest('Este código não pertence a um agendamento.');
    }

    const intent = challenge.payload as unknown as BookingIntent;
    const tenant = await this.loadTenant(intent.tenantId);

    const appointment = await this.persist(
      tenant,
      {
        tenantId: intent.tenantId,
        serviceIds: intent.serviceIds,
        barberId: intent.barberId,
        startsAt: new Date(intent.startsAt),
        notes: intent.notes,
        clientId: null,
        request,
      },
      { kind: 'guest', name: intent.guestName ?? 'Cliente', phone: intent.guestPhone ?? '' },
    );

    return { kind: 'confirmed', appointment };
  }

  // ── Consulta, cancelamento e remarcação ───────────────────────────────────

  async findByCode(input: AppointmentIdentityInput): Promise<AppointmentSummary> {
    const tenant = await this.loadTenant(input.tenantId);
    const appointment = await this.loadOwnedAppointment(tenant, input);
    return this.toSummary(tenant, appointment);
  }

  async cancel(
    input: AppointmentIdentityInput & { reason?: string | null; request?: RequestContext },
  ): Promise<AppointmentSummary> {
    const tenant = await this.loadTenant(input.tenantId);
    const appointment = await this.loadOwnedAppointment(tenant, input);

    this.assertChangeable(tenant, appointment);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Devolve à assinatura o uso que o agendamento tinha consumido.
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
          cancelReason: input.reason?.slice(0, 240) ?? 'Cancelado pelo cliente',
        },
        include: APPOINTMENT_INCLUDE,
      });
    });

    await this.audit.record(
      {
        action: AuditAction.APPOINTMENT_CANCELED,
        entity: 'Appointment',
        entityId: appointment.id,
        tenantId: tenant.id,
        actorClientId: input.clientId,
        metadata: { bookingCode: appointment.bookingCode, guest: !appointment.clientId },
      },
      input.request,
    );

    await this.notifications.onAppointmentCanceled(this.messageContext(tenant, updated));

    return this.toSummary(tenant, updated);
  }

  async reschedule(
    input: AppointmentIdentityInput & {
      startsAt: Date;
      barberId?: string | null;
      request?: RequestContext;
    },
  ): Promise<AppointmentSummary> {
    const tenant = await this.loadTenant(input.tenantId);
    const appointment = await this.loadOwnedAppointment(tenant, input);

    this.assertChangeable(tenant, appointment);

    const serviceIds = appointment.services.map((line) => line.serviceId);
    const durationMin = appointment.services.reduce((total, line) => total + line.durationMin, 0);
    const barberId = input.barberId ?? appointment.barberId;

    const slot = await this.assertSlotIsBookable(tenant, {
      tenantId: tenant.id,
      serviceIds,
      barberId,
      startsAt: input.startsAt,
      // O próprio agendamento ocupa o horário atual; ao remarcar ele não pode
      // bloquear a si mesmo.
      ignoreAppointmentId: appointment.id,
    });

    const chosenBarberId = barberId ?? (await this.pickBarber(tenant, slot.barberIds, input.startsAt));
    const endsAt = new Date(input.startsAt.getTime() + durationMin * 60_000);

    const updated = await this.runGuardingDoubleBooking(() =>
      this.prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          startsAt: input.startsAt,
          endsAt,
          barberId: chosenBarberId,
          status: AppointmentStatus.SCHEDULED,
          confirmedAt: null,
        },
        include: APPOINTMENT_INCLUDE,
      }),
    );

    await this.audit.record(
      {
        action: AuditAction.APPOINTMENT_RESCHEDULED,
        entity: 'Appointment',
        entityId: appointment.id,
        tenantId: tenant.id,
        actorClientId: input.clientId,
        metadata: {
          bookingCode: appointment.bookingCode,
          from: appointment.startsAt.toISOString(),
          to: input.startsAt.toISOString(),
        },
      },
      input.request,
    );

    await this.notifications.onAppointmentRescheduled(this.messageContext(tenant, updated));

    return this.toSummary(tenant, updated);
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  private async persist(
    tenant: TenantContextRow,
    input: CreateAppointmentInput,
    identity: ResolvedIdentity,
  ): Promise<AppointmentSummary> {
    const resolved = await this.catalog.resolveSelection(
      tenant.id,
      input.serviceIds,
      identity.kind === 'client' ? identity.clientId : null,
    );

    const serviceIds = resolved.services.map((service) => service.id);
    const durationMin = resolved.services.reduce((total, service) => total + service.durationMin, 0);

    const slot = await this.assertSlotIsBookable(tenant, {
      tenantId: tenant.id,
      serviceIds,
      barberId: input.barberId,
      startsAt: input.startsAt,
    });

    const barberId = input.barberId ?? (await this.pickBarber(tenant, slot.barberIds, input.startsAt));
    const endsAt = new Date(input.startsAt.getTime() + durationMin * 60_000);

    const created = await this.runGuardingDoubleBooking(() =>
      this.prisma.$transaction(async (tx) => {
        // Débito de assinatura ANTES de fixar preço: se a quota acabou entre a
        // cotação e agora, esta linha passa a ser cobrada.
        const lines: Array<{
          serviceId: string;
          priceCents: number;
          durationMin: number;
          usageId: string | null;
        }> = [];

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
          tenantId: tenant.id,
          bookingCode,
          barberId,
          // O "serviço principal" é o primeiro da seleção: é ele que aparece na
          // agenda do dashboard e na comanda.
          serviceId: lines[0]!.serviceId,
          clientId: identity.kind === 'client' ? identity.clientId : null,
          guestName: identity.kind === 'guest' ? identity.name : null,
          guestPhone: identity.kind === 'guest' ? identity.phone : null,
          startsAt: input.startsAt,
          endsAt,
          status: AppointmentStatus.SCHEDULED,
          origin: AppointmentOrigin.PUBLIC,
          priceCents: lines.reduce((total, line) => total + line.priceCents, 0),
          notes: input.notes?.slice(0, 500) ?? null,
          subscriptionUsageId: lines.find((line) => line.usageId)?.usageId ?? null,
          services: {
            create: lines.map((line, index) => ({
              tenantId: tenant.id,
              serviceId: line.serviceId,
              sortOrder: index,
              priceCents: line.priceCents,
              durationMin: line.durationMin,
              subscriptionUsageId: line.usageId,
            })),
          },
        }));

        if (identity.kind === 'client') {
          await this.touchClientProfile(tx, tenant.id, identity);
        }

        return appointment;
      }),
    );

    await this.audit.record(
      {
        action: AuditAction.APPOINTMENT_CREATED,
        entity: 'Appointment',
        entityId: created.id,
        tenantId: tenant.id,
        actorClientId: identity.kind === 'client' ? identity.clientId : null,
        metadata: {
          bookingCode: created.bookingCode,
          guest: identity.kind === 'guest',
          serviceIds,
          barberId,
        },
      },
      input.request,
    );

    await this.notifications.onAppointmentCreated(this.messageContext(tenant, created));

    return this.toSummary(tenant, created);
  }

  /**
   * Confirma que o horário pedido é um dos que o motor ofereceria AGORA.
   *
   * Sem isto, bastaria alterar o `startsAt` no corpo da requisição para agendar
   * às 3h da manhã, no almoço do barbeiro ou nas férias dele — a EXCLUDE só
   * enxerga colisão com outro agendamento, não expediente.
   */
  private async assertSlotIsBookable(
    tenant: TenantContextRow,
    input: {
      tenantId: string;
      serviceIds: string[];
      barberId: string | null;
      startsAt: Date;
      ignoreAppointmentId?: string;
    },
  ): Promise<{ barberIds: string[] }> {
    const dateKey = toDateKey(input.startsAt, tenant.timezone);
    const resolvedIds = input.serviceIds;

    const services = await this.prisma.service.findMany({
      where: { tenantId: tenant.id, id: { in: resolvedIds }, active: true, deletedAt: null },
      select: { durationMin: true },
    });

    if (services.length !== resolvedIds.length) {
      throw ApiException.badRequest('Serviço indisponível nesta barbearia.');
    }

    const availability = await this.availability.getAvailability({
      tenantId: tenant.id,
      timezone: tenant.timezone,
      serviceIds: resolvedIds,
      totalDurationMin: services.reduce((total, service) => total + service.durationMin, 0),
      barberId: input.barberId,
      fromDate: dateKey,
      selectedDate: dateKey,
      days: 1,
    });

    const wanted = input.startsAt.toISOString();
    const slot = availability.slots.find((candidate) => candidate.startsAt === wanted);

    if (slot) {
      return slot;
    }

    // Remarcar para o MESMO horário do próprio agendamento é legítimo (troca só
    // de barbeiro), mas o motor o vê ocupado — por ele mesmo.
    if (input.ignoreAppointmentId) {
      const self = await this.prisma.appointment.findFirst({
        where: { id: input.ignoreAppointmentId, tenantId: tenant.id, startsAt: input.startsAt },
        select: { barberId: true },
      });
      if (self) {
        return { barberIds: input.barberId ? [input.barberId] : [self.barberId] };
      }
    }

    throw new ApiException(HttpStatus.CONFLICT, {
      code: ErrorCode.DOUBLE_BOOKING,
      message: 'Esse horário acabou de ser ocupado. Escolha outro na grade atualizada.',
    });
  }

  /**
   * "Sem preferência" escolhe quem tem menos atendimentos NAQUELE dia, não o
   * primeiro da lista — senão o Carlos, que abre a lista, lotaria enquanto o
   * Bruno fica vazio. Empate desempata pela ordem do catálogo, que é estável.
   */
  private async pickBarber(
    tenant: TenantContextRow,
    barberIds: string[],
    startsAt: Date,
  ): Promise<string> {
    const first = barberIds[0];
    if (!first) {
      throw new ApiException(HttpStatus.CONFLICT, {
        code: ErrorCode.DOUBLE_BOOKING,
        message: 'Esse horário acabou de ser ocupado. Escolha outro na grade atualizada.',
      });
    }
    if (barberIds.length === 1) {
      return first;
    }

    const dateKey = toDateKey(startsAt, tenant.timezone);
    const dayStart = zonedTimeToUtc(dateKey, 0, tenant.timezone);
    const dayEnd = zonedTimeToUtc(addDays(dateKey, 1), 0, tenant.timezone);

    const load = await this.prisma.appointment.groupBy({
      by: ['barberId'],
      where: {
        tenantId: tenant.id,
        barberId: { in: barberIds },
        status: { notIn: [AppointmentStatus.CANCELED, AppointmentStatus.NO_SHOW] },
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      _count: { _all: true },
    });

    const countOf = new Map(load.map((row) => [row.barberId, row._count._all]));

    return barberIds.reduce((best, candidate) =>
      (countOf.get(candidate) ?? 0) < (countOf.get(best) ?? 0) ? candidate : best,
    );
  }

  private async insertWithUniqueCode(
    tx: PrismaTransaction,
    build: (bookingCode: string) => Prisma.AppointmentUncheckedCreateInput,
  ): Promise<AppointmentRow> {
    for (let attempt = 1; attempt <= BOOKING_CODE_ATTEMPTS; attempt += 1) {
      try {
        return await tx.appointment.create({
          data: build(generateBookingCode()),
          include: APPOINTMENT_INCLUDE,
        });
      } catch (error) {
        const collided =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          String(error.meta?.['target'] ?? '').includes('bookingCode');

        if (!collided || attempt === BOOKING_CODE_ATTEMPTS) {
          throw error;
        }
      }
    }

    // Inalcançável: o laço acima ou devolve ou relança.
    throw ApiException.conflict('Não foi possível gerar o código da reserva.');
  }

  /**
   * Traduz a violação da EXCLUDE `no_double_booking` em 409 com mensagem de
   * gente. O Prisma não mapeia constraint de exclusão para um código próprio,
   * então a detecção é pelo SQLSTATE `23P01` no texto do erro.
   */
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

  private async resolveIdentity(
    tenant: TenantContextRow,
    input: CreateAppointmentInput,
  ): Promise<ResolvedIdentity> {
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: input.clientId, deletedAt: null },
        select: { id: true, name: true, phone: true },
      });
      if (!client) {
        throw ApiException.unauthenticated('Sessão expirada. Entre novamente.');
      }

      await this.assertNotBlocked(tenant, client.id);

      return { kind: 'client', clientId: client.id, name: client.name, phone: client.phone };
    }

    const name = input.guest?.name?.trim();
    if (!name) {
      throw ApiException.badRequest('Informe seu nome.');
    }

    const phone = normalizeMobilePhone(input.guest?.phone ?? '');
    if (!phone) {
      throw ApiException.badRequest('Informe um WhatsApp válido com DDD.');
    }

    return { kind: 'guest', name, phone };
  }

  /** "Após 3 faltas o agendamento online é bloqueado" (`bloquearFaltasQtd`). */
  private async assertNotBlocked(tenant: TenantContextRow, clientId: string): Promise<void> {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { tenantId_clientId: { tenantId: tenant.id, clientId } },
      select: { blocked: true, noShowCount: true },
    });

    if (!profile) {
      return;
    }

    const noShowBlocked =
      tenant.settings.bloquearFaltasAtivo && profile.noShowCount >= tenant.settings.bloquearFaltasQtd;
    if (profile.blocked || noShowBlocked) {
      throw ApiException.forbidden(
        'Seu agendamento online está bloqueado nesta barbearia. Fale com a equipe pelo WhatsApp.',
        ErrorCode.ACCOUNT_DISABLED,
      );
    }
  }

  /**
   * Cria/atualiza o perfil do cliente NAQUELA barbearia.
   *
   * É aqui que a dívida das fases 01/03 é paga: `ClientProfile.phone` é cópia de
   * `Client.phone` e precisa ser reescrita a cada escrita do perfil, senão a
   * busca `(tenantId, phone)` do dashboard aponta para um número velho.
   */
  private async touchClientProfile(
    tx: PrismaTransaction,
    tenantId: string,
    identity: Extract<ResolvedIdentity, { kind: 'client' }>,
  ): Promise<void> {
    const now = new Date();
    await tx.clientProfile.upsert({
      where: { tenantId_clientId: { tenantId, clientId: identity.clientId } },
      create: {
        tenantId,
        clientId: identity.clientId,
        phone: identity.phone,
        firstVisitAt: now,
      },
      update: { phone: identity.phone },
    });
  }

  private async loadTenant(tenantId: string): Promise<TenantContextRow> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        timezone: true,
        settings: {
          select: {
            allowOnlineBooking: true,
            cancelamentoHoras: true,
            bloquearFaltasAtivo: true,
            bloquearFaltasQtd: true,
            antecedenciaMinima: true,
          },
        },
      },
    });

    if (!tenant) {
      throw ApiException.notFound('Barbearia não encontrada.');
    }

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      timezone: tenant.timezone,
      settings: {
        allowOnlineBooking: tenant.settings?.allowOnlineBooking ?? true,
        cancelamentoHoras: tenant.settings?.cancelamentoHoras ?? 2,
        bloquearFaltasAtivo: tenant.settings?.bloquearFaltasAtivo ?? true,
        bloquearFaltasQtd: tenant.settings?.bloquearFaltasQtd ?? 3,
        antecedenciaMinima: tenant.settings?.antecedenciaMinima ?? 60,
      },
    };
  }

  /**
   * Carrega o agendamento provando que quem pede é dono dele.
   *
   * Cliente logado prova pela sessão; visitante prova pelo par código +
   * telefone. O código sozinho não basta: ele viaja por WhatsApp e pode ser
   * encaminhado sem querer.
   */
  private async loadOwnedAppointment(
    tenant: TenantContextRow,
    input: AppointmentIdentityInput,
  ): Promise<AppointmentRow> {
    const appointment = await this.prisma.appointment.findUnique({
      where: {
        tenantId_bookingCode: {
          tenantId: tenant.id,
          bookingCode: normalizeBookingCode(input.bookingCode),
        },
      },
      include: APPOINTMENT_INCLUDE,
    });

    // 404 idêntico para "não existe" e "não é seu": responder diferente
    // transformaria a rota num oráculo de códigos válidos.
    const notFound = (): never => {
      throw ApiException.notFound('Agendamento não encontrado.');
    };

    if (!appointment) {
      return notFound();
    }

    if (appointment.clientId) {
      return appointment.clientId === input.clientId ? appointment : notFound();
    }

    const phone = input.phone ? normalizeMobilePhone(input.phone) : null;
    return phone && phone === appointment.guestPhone ? appointment : notFound();
  }

  /** Regra única de "ainda dá para mexer neste horário" (`cancelamentoHoras`). */
  private assertChangeable(tenant: TenantContextRow, appointment: AppointmentRow): void {
    if (
      appointment.status === AppointmentStatus.CANCELED ||
      appointment.status === AppointmentStatus.DONE ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      throw ApiException.conflict('Este agendamento não pode mais ser alterado.');
    }

    if (!isWithinChangeWindow(appointment.startsAt, tenant.settings.cancelamentoHoras)) {
      throw ApiException.conflict(
        `Cancelamentos e remarcações só até ${tenant.settings.cancelamentoHoras}h antes do horário. Fale com a barbearia pelo WhatsApp.`,
      );
    }
  }

  private messageContext(tenant: TenantContextRow, appointment: AppointmentRow) {
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      timezone: tenant.timezone,
      appointmentId: appointment.id,
      bookingCode: appointment.bookingCode,
      recipientPhone: appointment.client?.phone ?? appointment.guestPhone ?? '',
      clientName: appointment.client?.name ?? appointment.guestName ?? 'Cliente',
      barberName: appointment.barber.name,
      serviceNames: sortedLines(appointment).map((line) => line.service.name),
      startsAt: appointment.startsAt,
    };
  }

  private toSummary(tenant: TenantContextRow, appointment: AppointmentRow): AppointmentSummary {
    const lines = sortedLines(appointment);

    return {
      id: appointment.id,
      bookingCode: appointment.bookingCode,
      status: appointment.status,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      timezone: tenant.timezone,
      barber: {
        id: appointment.barber.id,
        name: appointment.barber.name,
        avatarUrl: appointment.barber.avatarUrl,
      },
      services: lines.map((line) => ({
        id: line.serviceId,
        name: line.service.name,
        durationMin: line.durationMin,
        priceCents: line.priceCents,
      })),
      totalPriceCents: appointment.priceCents,
      coveredBySubscription: lines.some((line) => line.subscriptionUsageId !== null),
      clientName: appointment.client?.name ?? appointment.guestName ?? 'Cliente',
      notes: appointment.notes,
      cancelWindowHours: tenant.settings.cancelamentoHoras,
      cancelable:
        (appointment.status === AppointmentStatus.SCHEDULED ||
          appointment.status === AppointmentStatus.CONFIRMED) &&
        isWithinChangeWindow(appointment.startsAt, tenant.settings.cancelamentoHoras),
    };
  }
}

// ── Tipos e helpers do módulo ───────────────────────────────────────────────

const APPOINTMENT_INCLUDE = {
  barber: { select: { id: true, name: true, avatarUrl: true } },
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

interface TenantContextRow {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  settings: {
    allowOnlineBooking: boolean;
    cancelamentoHoras: number;
    bloquearFaltasAtivo: boolean;
    bloquearFaltasQtd: number;
    antecedenciaMinima: number;
  };
}

type ResolvedIdentity =
  | { kind: 'client'; clientId: string; name: string; phone: string }
  | { kind: 'guest'; name: string; phone: string };

function sortedLines(appointment: AppointmentRow): AppointmentRow['services'] {
  return [...appointment.services].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function isWithinChangeWindow(startsAt: Date, windowHours: number): boolean {
  return startsAt.getTime() - Date.now() >= windowHours * 3_600_000;
}

/** SQLSTATE `23P01` = `exclusion_violation`, a assinatura da `no_double_booking`. */
export function isExclusionViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // O Prisma expõe o SQLSTATE bruto em `meta.code` nos erros que não mapeia.
    if (String(error.meta?.['code'] ?? '') === '23P01') {
      return true;
    }
  }

  const message =
    error instanceof Error ? `${error.message}` : typeof error === 'string' ? error : '';

  return message.includes('23P01') || message.includes('no_double_booking');
}
