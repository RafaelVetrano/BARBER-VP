import { Injectable } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { maskEmail } from '../../common/utils/mask';
import type { MailAdapter, SendMailParams, SendMailResult } from './mail.adapter';

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
}
