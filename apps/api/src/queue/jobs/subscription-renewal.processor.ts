import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  SubscriptionRenewalService,
  type RenewalSummary,
} from '../../client-account/subscription-renewal.service';
import { QUEUE_SUBSCRIPTIONS } from '../queue.constants';

/**
 * Renovação diária das assinaturas do cliente (fase 05).
 *
 * `runOnce()` já existia pronta e testada desde a fase 05, esperando
 * exatamente por isto — o processor é só a ponte entre o relógio e ela.
 */
@Injectable()
@Processor(QUEUE_SUBSCRIPTIONS)
export class SubscriptionRenewalProcessor extends WorkerHost {
  constructor(
    private readonly renewals: SubscriptionRenewalService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SubscriptionRenewalProcessor.name);
  }

  async process(job: Job): Promise<RenewalSummary> {
    const summary = await this.renewals.runOnce();
    this.logger.info({ jobId: job.id, ...summary }, 'renovação de assinaturas concluída');
    return summary;
  }
}
