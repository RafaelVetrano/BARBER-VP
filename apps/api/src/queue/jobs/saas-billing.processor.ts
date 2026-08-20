import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { RunBillingCycleResult } from '@barbervp/types';
import { AdminBillingService } from '../../admin/billing/admin-billing.service';
import { QUEUE_BILLING } from '../queue.constants';

/**
 * Ciclo de billing do SaaS (fase 08), agora rodando sozinho todo dia.
 *
 * Sem ator: `runCycle(null)` grava o `AuditLog` com `actorUserId: null` e
 * `trigger: 'schedule'`, que é como se distingue esta rodada da que o super
 * admin dispara pelo botão da tela de Billing.
 */
@Injectable()
@Processor(QUEUE_BILLING)
export class SaasBillingProcessor extends WorkerHost {
  constructor(
    private readonly billing: AdminBillingService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SaasBillingProcessor.name);
  }

  async process(job: Job): Promise<RunBillingCycleResult> {
    const result = await this.billing.runCycle();
    this.logger.info({ jobId: job.id, ...result }, 'ciclo de billing do SaaS concluído');
    return result;
  }
}
