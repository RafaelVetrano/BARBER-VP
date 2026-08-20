import { Inject, Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  NOTIFICATION_ADAPTER,
  type NotificationAdapter,
} from '../../adapters/notification/notification.adapter';
import { MAIL_ADAPTER, type MailAdapter } from '../../adapters/mail/mail.adapter';
import { QUEUE_OUTBOX } from '../queue.constants';

export interface OutboxDrainResult {
  notifications: { picked: number; delivered: number; failed: number };
  mails: { picked: number; delivered: number; failed: number };
}

/**
 * Dreno dos dois outboxes.
 *
 * É este job que finalmente entrega os lembretes de agendamento que a fase 04
 * deixou persistidos com `scheduledFor` no futuro — a dívida "os lembretes
 * existem, mas ninguém os envia" morre aqui.
 *
 * O processor não conhece driver nenhum: chama `dispatchDue` nos DOIS
 * adapters e deixa cada driver decidir o que isso significa. Trocar o mock
 * pelo WhatsApp real não muda uma linha deste arquivo.
 */
@Injectable()
@Processor(QUEUE_OUTBOX)
export class OutboxProcessor extends WorkerHost {
  constructor(
    private readonly logger: PinoLogger,
    @Inject(NOTIFICATION_ADAPTER) private readonly notifications: NotificationAdapter,
    @Inject(MAIL_ADAPTER) private readonly mails: MailAdapter,
  ) {
    super();
    this.logger.setContext(OutboxProcessor.name);
  }

  async process(job: Job): Promise<OutboxDrainResult> {
    const now = new Date();

    const [notifications, mails] = await Promise.all([
      this.notifications.dispatchDue({ now }),
      this.mails.dispatchDue({ now }),
    ]);

    // Rodada vazia é o caso comum (a fila acorda a cada minuto): logar em
    // `info` encheria o log de ruído sem informação.
    if (notifications.picked > 0 || mails.picked > 0) {
      this.logger.info({ jobId: job.id, notifications, mails }, 'outbox drenado');
    }

    return { notifications, mails };
  }
}
