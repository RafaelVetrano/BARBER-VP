import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import type { ClientAppointmentItem, ClientAppointmentsResponse } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { isWithinChangeWindow } from '../booking/appointments.service';
import type { RequestContext } from '../common/types/request-context';
import type { RateAppointmentDto } from './dto/client-account.dto';

const APPOINTMENT_INCLUDE = {
  barber: { select: { id: true, name: true, avatarUrl: true } },
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
  review: { select: { id: true, rating: true, comment: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

/**
 * Leitura + avaliação dos agendamentos do cliente logado, escopados à
 * barbearia da URL — a aba "Agendamentos" da `MinhaConta`.
 *
 * Remarcar e cancelar NÃO duplicam lógica aqui: são o MESMO
 * `AppointmentsService.cancel`/`.reschedule` da fase 04, chamados pelo
 * controller com o `clientId` da sessão. O que só existe para o cliente
 * autenticado — listar por conta e avaliar — mora neste serviço.
 */
@Injectable()
export class ClientAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, clientId: string): Promise<ClientAppointmentsResponse> {
    const meta = await this.loadTenantMeta(tenantId);
    const now = new Date();

    const [upcoming, history] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          clientId,
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
          startsAt: { gte: now },
        },
        orderBy: { startsAt: 'asc' },
        include: APPOINTMENT_INCLUDE,
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          clientId,
          OR: [
            { status: { in: [AppointmentStatus.DONE, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELED] } },
            { startsAt: { lt: now } },
          ],
        },
        orderBy: { startsAt: 'desc' },
        include: APPOINTMENT_INCLUDE,
      }),
    ]);

    return {
      upcoming: upcoming.map((appointment) => this.toItem(appointment, meta)),
      history: history.map((appointment) => this.toItem(appointment, meta)),
    };
  }

  /**
   * Avalia um atendimento CONCLUÍDO ainda não avaliado. Uma nota por visita —
   * `Review.appointmentId` é `@unique`, então uma segunda tentativa falha limpo
   * em vez de duplicar (o front já esconde o formulário depois da primeira).
   */
  async rate(
    tenantId: string,
    clientId: string,
    appointmentId: string,
    dto: RateAppointmentDto,
    request: RequestContext,
  ): Promise<ClientAppointmentItem> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId, clientId },
      include: APPOINTMENT_INCLUDE,
    });

    if (!appointment) {
      throw ApiException.notFound('Agendamento não encontrado.');
    }
    if (appointment.status !== AppointmentStatus.DONE) {
      throw ApiException.conflict('Só é possível avaliar atendimentos concluídos.');
    }
    if (appointment.review) {
      throw ApiException.conflict('Este atendimento já foi avaliado.');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: clientId },
      select: { name: true },
    });

    await this.prisma.review.create({
      data: {
        tenantId,
        clientId,
        barberId: appointment.barberId,
        appointmentId: appointment.id,
        authorName: client?.name ?? 'Cliente',
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      },
    });

    await this.audit.record(
      {
        action: AuditAction.APPOINTMENT_RATED,
        entity: 'Appointment',
        entityId: appointment.id,
        tenantId,
        actorClientId: clientId,
        metadata: { rating: dto.rating },
      },
      request,
    );

    const meta = await this.loadTenantMeta(tenantId);
    const refreshed = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      include: APPOINTMENT_INCLUDE,
    });
    return this.toItem(refreshed, meta);
  }

  private async loadTenantMeta(
    tenantId: string,
  ): Promise<{ cancelamentoHoras: number; timezone: string }> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { timezone: true, settings: { select: { cancelamentoHoras: true } } },
    });
    return {
      cancelamentoHoras: tenant?.settings?.cancelamentoHoras ?? 2,
      timezone: tenant?.timezone ?? 'America/Sao_Paulo',
    };
  }

  private toItem(
    appointment: AppointmentRow,
    meta: { cancelamentoHoras: number; timezone: string },
  ): ClientAppointmentItem {
    const lines = [...appointment.services].sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      id: appointment.id,
      bookingCode: appointment.bookingCode,
      status: appointment.status,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      timezone: meta.timezone,
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
      cancelWindowHours: meta.cancelamentoHoras,
      cancelable:
        (appointment.status === AppointmentStatus.SCHEDULED ||
          appointment.status === AppointmentStatus.CONFIRMED) &&
        isWithinChangeWindow(appointment.startsAt, meta.cancelamentoHoras),
      review: appointment.review
        ? { id: appointment.review.id, rating: appointment.review.rating, comment: appointment.review.comment }
        : null,
    };
  }
}
