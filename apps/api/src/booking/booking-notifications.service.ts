import { Inject, Injectable } from '@nestjs/common';
import { WhatsappEvent } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_ADAPTER,
  type NotificationAdapter,
} from '../adapters/notification/notification.adapter';
import { toDateKey, toMinutesOfDay, zonedParts } from '../common/utils/timezone';

export interface AppointmentMessageContext {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  timezone: string;
  appointmentId: string;
  bookingCode: string;
  recipientPhone: string;
  clientName: string;
  barberName: string;
  serviceNames: string[];
  startsAt: Date;
}

/** Padrão usado quando a barbearia não configurou o template do evento. */
const FALLBACK_TEMPLATES: Partial<Record<WhatsappEvent, string>> = {
  CONFIRMATION:
    'Olá {nome}! Seu horário está confirmado para {data} às {horario} com {barbeiro} ({servico}). Até lá!',
  REMINDER:
    'Oi {nome}, lembrando do seu horário em {data} às {horario} — {servico} com {barbeiro}. Precisa remarcar? {link_agendamento}',
  CANCELLATION:
    '{nome}, seu horário de {data} às {horario} foi cancelado. Quando quiser, é só reagendar: {link_agendamento}',
};

/**
 * Mensagens de agendamento — confirmação, lembretes e cancelamento.
 *
 * Tudo sai pelo `NotificationAdapter` (driver mock nesta fase, que persiste em
 * `NotificationOutbox`). O corpo vem de `WhatsappAutomationConfig`, o mesmo
 * template que o dono edita na tela de automações: se ele desligar o evento, a
 * mensagem não sai — inclusive esta.
 *
 * Os lembretes nascem com `scheduledFor` no futuro e status `PENDING`. Nada os
 * envia ainda: a fila BullMQ é da fase 09, e é ela que vai varrer
 * `NotificationOutbox` por `status = PENDING AND scheduledFor <= now()`.
 * Deixá-los persistidos desde já é o que permite trocar o disparo sem tocar em
 * nada do booking.
 *
 * Nenhuma falha de mensagem derruba o agendamento: o cliente tem horário
 * marcado mesmo que o WhatsApp esteja fora do ar.
 */
@Injectable()
export class BookingNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(NOTIFICATION_ADAPTER) private readonly notifications: NotificationAdapter,
  ) {
    this.logger.setContext(BookingNotificationsService.name);
  }

  /** Confirmação imediata + os dois lembretes configurados no tenant. */
  async onAppointmentCreated(context: AppointmentMessageContext): Promise<void> {
    await this.safely(async () => {
      await this.dispatch(WhatsappEvent.CONFIRMATION, context, null);
      await this.scheduleReminders(context);
    }, 'confirmação/lembretes');
  }

  async onAppointmentCanceled(context: AppointmentMessageContext): Promise<void> {
    await this.safely(async () => {
      await this.cancelPendingReminders(context.appointmentId);
      await this.dispatch(WhatsappEvent.CANCELLATION, context, null);
    }, 'cancelamento');
  }

  /** Remarcação: derruba os lembretes do horário antigo e reprograma. */
  async onAppointmentRescheduled(context: AppointmentMessageContext): Promise<void> {
    await this.safely(async () => {
      await this.cancelPendingReminders(context.appointmentId);
      await this.dispatch(WhatsappEvent.CONFIRMATION, context, null);
      await this.scheduleReminders(context);
    }, 'remarcação');
  }

  private async scheduleReminders(context: AppointmentMessageContext): Promise<void> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: context.tenantId },
      select: { lembrete1Horas: true, lembrete2Horas: true },
    });

    const hours = [settings?.lembrete1Horas ?? 24, settings?.lembrete2Horas ?? 2]
      // 0 desliga o lembrete; duplicata viraria mensagem repetida.
      .filter((value, index, all) => value > 0 && all.indexOf(value) === index);

    for (const offsetHours of hours) {
      const scheduledFor = new Date(context.startsAt.getTime() - offsetHours * 3_600_000);
      // Agendamento para daqui a uma hora não recebe lembrete de 24h antes:
      // a mensagem já nasceria vencida.
      if (scheduledFor.getTime() <= Date.now()) {
        continue;
      }
      await this.dispatch(WhatsappEvent.REMINDER, context, scheduledFor);
    }
  }

  /**
   * Lembrete de horário que mudou (ou deixou de existir) não pode sair. Como
   * ainda não há fila, "cancelar" é marcar a linha do outbox como FAILED com o
   * motivo — o histórico fica, e o worker da fase 09 só olha para `PENDING`.
   */
  private async cancelPendingReminders(appointmentId: string): Promise<void> {
    await this.prisma.notificationOutbox.updateMany({
      where: {
        status: 'PENDING',
        templateKey: `appointment.${WhatsappEvent.REMINDER.toLowerCase()}`,
        payload: { path: ['appointmentId'], equals: appointmentId },
      },
      data: { status: 'FAILED', error: 'agendamento cancelado ou remarcado' },
    });
  }

  private async dispatch(
    event: WhatsappEvent,
    context: AppointmentMessageContext,
    scheduledFor: Date | null,
  ): Promise<void> {
    const config = await this.prisma.whatsappAutomationConfig.findUnique({
      where: { tenantId_event: { tenantId: context.tenantId, event } },
      select: { enabled: true, template: true },
    });

    // Sem linha de configuração vale o padrão; com a linha desligada, o dono
    // decidiu que não quer a mensagem, e a decisão dele vale.
    if (config && !config.enabled) {
      return;
    }

    const template = config?.template ?? FALLBACK_TEMPLATES[event];
    if (!template) {
      return;
    }

    await this.notifications.send({
      tenantId: context.tenantId,
      recipient: context.recipientPhone,
      templateKey: `appointment.${event.toLowerCase()}`,
      body: renderTemplate(template, context, this.bookingLink(context.tenantSlug)),
      scheduledFor,
      payload: {
        event,
        appointmentId: context.appointmentId,
        bookingCode: context.bookingCode,
      },
    });
  }

  private bookingLink(slug: string): string {
    return `${this.config.urls.publicBooking}/${slug}`;
  }

  private async safely(run: () => Promise<void>, what: string): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error({ err: error, what }, 'falha ao enfileirar mensagem de agendamento');
    }
  }
}

const WEEKDAY_FULL = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const MONTH_FULL = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Substitui os placeholders de `WHATSAPP_TEMPLATE_VARS`. Data e hora saem no
 * fuso da barbearia — é o relógio que o cliente vai olhar quando chegar lá.
 */
export function renderTemplate(
  template: string,
  context: AppointmentMessageContext,
  bookingLink: string,
): string {
  const parts = zonedParts(context.startsAt, context.timezone);
  const weekday = new Date(`${toDateKey(context.startsAt, context.timezone)}T00:00:00Z`).getUTCDay();
  const minutes = toMinutesOfDay(context.startsAt, context.timezone);

  const values: Record<string, string> = {
    nome: context.clientName.split(' ')[0] ?? context.clientName,
    data: `${WEEKDAY_FULL[weekday]}, ${parts.day} de ${MONTH_FULL[parts.month - 1]}`,
    horario: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    servico: context.serviceNames.join(' + '),
    barbeiro: context.barberName,
    link_agendamento: bookingLink,
  };

  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
