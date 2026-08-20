import { Injectable } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { maskEmail } from '../../common/utils/mask';
import type {
  DispatchDueMailResult,
  MailAdapter,
  SendMailParams,
  SendMailResult,
} from './mail.adapter';

/** Mesmo teto do driver de notificação — ver comentário lá. */
const MAX_ATTEMPTS = 5;

/** Driver mock de e-mail: loga e persiste em `MailOutbox`. Sem SMTP. */
@Injectable()
export class MockMailDriver implements MailAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MockMailDriver.name);
  }

  async send(params: SendMailParams): Promise<SendMailResult> {
    const record = await this.prisma.mailOutbox.create({
      data: {
        tenantId: params.tenantId ?? null,
        to: params.to,
        subject: params.subject,
        body: params.body,
        payload: (params.payload ?? {}) as object,
        status: OutboxStatus.SENT,
        attempts: 1,
        sentAt: new Date(),
      },
      select: { id: true },
    });

    this.logger.info(
      { outboxId: record.id, to: maskEmail(params.to), subject: params.subject },
      'e-mail simulado (driver mock)',
    );

    return { outboxId: record.id, externalId: null, delivered: true };
  }

  /**
   * Repescagem do que não saiu. O `send` do mock já nasce `SENT`, então na
   * prática esta varredura só encontra linha que ficou `PENDING` porque a
   * escrita morreu no meio — o valor real dela é o dia em que existir um
   * driver SMTP de verdade, cujo `send` pode falhar e deixar a linha para trás.
   */
  async dispatchDue(params: { now?: Date; limit?: number } = {}): Promise<DispatchDueMailResult> {
    const limit = params.limit ?? 100;

    const due = await this.prisma.mailOutbox.findMany({
      where: { status: OutboxStatus.PENDING, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, to: true, subject: true, attempts: true },
    });

    let delivered = 0;
    let failed = 0;

    for (const mail of due) {
      const claimed = await this.prisma.mailOutbox.updateMany({
        where: { id: mail.id, status: OutboxStatus.PENDING, attempts: mail.attempts },
        data: { attempts: { increment: 1 } },
      });

      if (claimed.count === 0) {
        continue;
      }

      try {
        await this.prisma.mailOutbox.update({
          where: { id: mail.id },
          data: { status: OutboxStatus.SENT, sentAt: new Date(), error: null },
        });
        delivered += 1;
        this.logger.info(
          { outboxId: mail.id, to: maskEmail(mail.to), subject: mail.subject },
          'e-mail pendente entregue (driver mock)',
        );
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : 'erro desconhecido';
        await this.prisma.mailOutbox.update({
          where: { id: mail.id },
          data: {
            status: mail.attempts + 1 >= MAX_ATTEMPTS ? OutboxStatus.FAILED : OutboxStatus.PENDING,
            error: reason,
          },
        });
        this.logger.warn({ outboxId: mail.id, err: reason }, 'falha ao entregar e-mail');
      }
    }

    return { picked: due.length, delivered, failed };
  }
}
