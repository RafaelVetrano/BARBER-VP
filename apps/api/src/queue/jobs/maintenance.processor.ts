import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { MaintenanceService, type MaintenanceSummary } from './maintenance.service';
import { QUEUE_MAINTENANCE } from '../queue.constants';

/** Faxina diária — ver `MaintenanceService` para as retenções e o porquê. */
@Injectable()
@Processor(QUEUE_MAINTENANCE)
export class MaintenanceProcessor extends WorkerHost {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(MaintenanceProcessor.name);
  }

  async process(job: Job): Promise<MaintenanceSummary> {
    const summary = await this.maintenance.runOnce();
    this.logger.debug({ jobId: job.id, ...summary }, 'faxina executada');
    return summary;
  }
}
