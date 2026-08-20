import { Injectable } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { maskPhone } from '../../common/utils/mask';
import type {
  DispatchDueResult,
  NotificationAdapter,
  SendNotificationParams,
  SendNotificationResult,
} from './notification.adapter';

/**
 * Teto de tentativas por mensagem. Passou disto, a linha fica `FAILED` para
 * sempre e some da varredura — sem isto, uma mensagem cronicamente ruim
 * (destino inválido) seria repescada a cada minuto para sempre.
 */
const MAX_ATTEMPTS = 5;

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

  /**
   * Varre o próprio outbox: `PENDING` com `scheduledFor` já vencido (ou nulo,
   * caso de uma mensagem imediata que morreu no meio da escrita).
   *
   * O `updateMany` que carimba `attempts` ANTES de entregar é o que torna a
   * rodada segura com mais de um worker: quem incrementa é quem leva a
   * mensagem, e a linha sai da janela de seleção da rodada seguinte.
   */
  async dispatchDue(params: { now?: Date; limit?: number } = {}): Promise<DispatchDueResult> {
    const now = params.now ?? new Date();
    const limit = params.limit ?? 100;

    const due = await this.prisma.notificationOutbox.findMany({
      where: {
        status: OutboxStatus.PENDING,
        attempts: { lt: MAX_ATTEMPTS },
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
      },
      orderBy: { scheduledFor: 'asc' },
      take: limit,
      select: { id: true, tenantId: true, recipient: true, templateKey: true, attempts: true },
    });

    let delivered = 0;
    let failed = 0;

    for (const message of due) {
      // Reivindica a linha: só entrega quem conseguiu mover o `attempts` a
      // partir do valor que leu. Outro worker que tenha pegado a mesma
      // mensagem no mesmo instante encontra `count: 0` e a ignora.
      const claimed = await this.prisma.notificationOutbox.updateMany({
        where: { id: message.id, status: OutboxStatus.PENDING, attempts: message.attempts },
        data: { attempts: { increment: 1 } },
      });

      if (claimed.count === 0) {
        continue;
      }

      try {
        // Aqui entraria a chamada ao provedor. O mock não tem para onde
        // ligar — a entrega é o próprio carimbo.
        await this.prisma.notificationOutbox.update({
          where: { id: message.id },
          data: { status: OutboxStatus.SENT, sentAt: new Date(), error: null },
        });
        delivered += 1;

        this.logger.info(
          {
            outboxId: message.id,
            tenantId: message.tenantId,
            templateKey: message.templateKey,
            recipient: maskPhone(message.recipient),
          },
          'notificação agendada entregue (driver mock)',
        );
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : 'erro desconhecido';
        await this.prisma.notificationOutbox.update({
          where: { id: message.id },
          data: {
            // Só desiste de vez ao esgotar o teto; abaixo dele volta a
            // PENDING e a próxima rodada tenta de novo.
            status:
              message.attempts + 1 >= MAX_ATTEMPTS ? OutboxStatus.FAILED : OutboxStatus.PENDING,
            error: reason,
          },
        });
        this.logger.warn({ outboxId: message.id, err: reason }, 'falha ao entregar notificação');
      }
    }

    return { picked: due.length, delivered, failed };
  }
}
