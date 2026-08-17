import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { ClientSubscriptionService } from './client-subscription.service';

export interface RenewalSummary {
  due: number;
  renewed: number;
  failed: number;
}

/**
 * Renovação de ciclo das assinaturas do cliente — a metade "job" do SPEC
 * ("renovação de ciclo via job BullMQ mock… a lógica deve existir e ser
 * testável isoladamente").
 *
 * A fila de verdade só liga na fase 09 (mesma dívida do lembrete de
 * agendamento da fase 04: `NotificationOutbox.scheduledFor` existe, ninguém
 * ainda o varre). Aqui a peça que a fase 09 vai agendar já existe pronta e
 * coberta por teste — `runOnce()` é chamável direto de um `@Cron`/worker
 * BullMQ sem qualquer mudança.
 *
 * `PAUSED` nunca aparece aqui: pausar "zera cobrança até reativar" (SPEC), e
 * é `resume()` — não o relógio — quem decide se o cliente perdeu o ciclo.
 */
@Injectable()
export class SubscriptionRenewalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly audit: AuditService,
    private readonly subscriptions: ClientSubscriptionService,
  ) {
    this.logger.setContext(SubscriptionRenewalService.name);
  }

  async runOnce(now = new Date()): Promise<RenewalSummary> {
    const due = await this.prisma.clientSubscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        currentPeriodEnd: { lte: now },
      },
      select: { id: true, tenantId: true, clientId: true },
    });

    let renewed = 0;
    let failed = 0;

    for (const subscription of due) {
      try {
        await this.subscriptions.renewCycle(subscription.id);
        await this.audit.record({
          action: AuditAction.SUBSCRIPTION_RENEWED,
          entity: 'ClientSubscription',
          entityId: subscription.id,
          tenantId: subscription.tenantId,
          actorClientId: subscription.clientId,
        });
        renewed += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          { err: error, subscriptionId: subscription.id },
          'falha ao renovar ciclo de assinatura',
        );
      }
    }

    if (due.length > 0) {
      this.logger.info({ due: due.length, renewed, failed }, 'renovação de assinaturas processada');
    }

    return { due: due.length, renewed, failed };
  }
}
