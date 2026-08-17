import { Injectable } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { maskPhone } from '../../common/utils/mask';
import type {
  NotificationAdapter,
  SendNotificationParams,
  SendNotificationResult,
} from './notification.adapter';

/**
 * Driver mock de WhatsApp: loga e persiste em `NotificationOutbox`, marcando
 * como SENT. Nenhuma chamada externa. Serve de trilha auditável em dev e de
 * fixture para os testes das fases seguintes.
 */
@Injectable()
export class MockNotificationDriver implements NotificationAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MockNotificationDriver.name);
  }

  async send(params: SendNotificationParams): Promise<SendNotificationResult> {
    const now = new Date();
    // Mensagem com data futura fica PENDING no outbox: é o lembrete de
    // agendamento esperando a fila BullMQ da fase 09 drenar.
    const scheduled = params.scheduledFor && params.scheduledFor.getTime() > now.getTime();

    const record = await this.prisma.notificationOutbox.create({
      data: {
        tenantId: params.tenantId ?? null,
        channel: params.channel ?? 'WHATSAPP',
        recipient: params.recipient,
        templateKey: params.templateKey,
        body: params.body,
        payload: (params.payload ?? {}) as object,
        scheduledFor: params.scheduledFor ?? null,
        status: scheduled ? OutboxStatus.PENDING : OutboxStatus.SENT,
        attempts: scheduled ? 0 : 1,
        sentAt: scheduled ? null : now,
      },
      select: { id: true },
    });

    // Telefone mascarado — log não é lugar de dado pessoal completo.
    this.logger.info(
      {
        outboxId: record.id,
        tenantId: params.tenantId ?? null,
        templateKey: params.templateKey,
        recipient: maskPhone(params.recipient),
        scheduledFor: params.scheduledFor?.toISOString() ?? null,
      },
      scheduled ? 'notificação agendada (driver mock)' : 'notificação simulada (driver mock)',
    );

    return { outboxId: record.id, externalId: null, delivered: !scheduled };
  }
}
