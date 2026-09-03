import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  WhatsappAutomationsService,
  type AutomationRunSummary,
} from './whatsapp-automations.service';
import { QUEUE_AUTOMATIONS } from '../queue.constants';

/**
 * Disparo diário das automações de CALENDÁRIO do WhatsApp — aniversário,
 * reativação e avaliação. Ver `WhatsappAutomationsService` para o porquê de
 * cada janela e para a deduplicação.
 */
@Injectable()
@Processor(QUEUE_AUTOMATIONS)
export class WhatsappAutomationsProcessor extends WorkerHost {
  constructor(
    private readonly automations: WhatsappAutomationsService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(WhatsappAutomationsProcessor.name);
  }

  async process(job: Job): Promise<AutomationRunSummary> {
    const summary = await this.automations.runOnce();
    this.logger.debug({ jobId: job.id, ...summary }, 'automações de calendário executadas');
    return summary;
  }
}
