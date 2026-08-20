import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../config/configuration';
import {
  JOB_CLEANUP_EXPIRED,
  JOB_DISPATCH_OUTBOX,
  JOB_RENEW_SUBSCRIPTIONS,
  JOB_RUN_SAAS_BILLING,
  QUEUE_BILLING,
  QUEUE_MAINTENANCE,
  QUEUE_OUTBOX,
  QUEUE_SUBSCRIPTIONS,
  REPEAT_JOB_IDS,
} from './queue.constants';

/**
 * Registra os agendamentos repetíveis no boot.
 *
 * Roda mesmo com os workers desligados: o agendamento vive no Redis, não no
 * processo — uma réplica só-web pode declarar o cron e uma réplica só-worker
 * consumi-lo. `jobId` fixo por fila (ver `REPEAT_JOB_IDS`) garante que N
 * réplicas subindo juntas não multipliquem o mesmo cron.
 *
 * Antes de registrar, remove agendamentos antigos da fila: mudar
 * `QUEUE_SAAS_BILLING_HOUR` no env sem isso deixaria o cron velho vivo ao lado
 * do novo, e a cobrança sairia duas vezes por dia.
 */
@Injectable()
export class QueueSchedulerService implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
    @InjectQueue(QUEUE_OUTBOX) private readonly outbox: Queue,
    @InjectQueue(QUEUE_SUBSCRIPTIONS) private readonly subscriptions: Queue,
    @InjectQueue(QUEUE_BILLING) private readonly billing: Queue,
    @InjectQueue(QUEUE_MAINTENANCE) private readonly maintenance: Queue,
  ) {
    this.logger.setContext(QueueSchedulerService.name);
  }

  async onModuleInit(): Promise<void> {
    const { queue } = this.config;
    const tz = queue.timezone;

    try {
      await Promise.all([
        this.schedule(this.outbox, JOB_DISPATCH_OUTBOX, {
          every: queue.outboxIntervalSeconds * 1_000,
        }),
        this.schedule(this.subscriptions, JOB_RENEW_SUBSCRIPTIONS, {
          pattern: `0 0 ${queue.subscriptionRenewalHour} * * *`,
          tz,
        }),
        this.schedule(this.billing, JOB_RUN_SAAS_BILLING, {
          pattern: `0 0 ${queue.saasBillingHour} * * *`,
          tz,
        }),
        this.schedule(this.maintenance, JOB_CLEANUP_EXPIRED, {
          pattern: `0 0 ${queue.maintenanceHour} * * *`,
          tz,
        }),
      ]);

      this.logger.info(
        { workersEnabled: queue.workersEnabled, timezone: tz },
        'agendamentos das filas registrados',
      );
    } catch (error) {
      // Redis fora do ar não pode impedir a API de servir requisição. O
      // `/health` já reporta o Redis, e o próximo boot registra o cron.
      this.logger.error(
        { err: error instanceof Error ? error.message : error },
        'não foi possível registrar os agendamentos das filas',
      );
    }
  }

  private async schedule(
    queue: Queue,
    jobName: string,
    repeat: { every?: number; pattern?: string; tz?: string },
  ): Promise<void> {
    const jobId = REPEAT_JOB_IDS[queue.name as keyof typeof REPEAT_JOB_IDS];

    for (const existing of await queue.getJobSchedulers()) {
      if (existing.key) {
        await queue.removeJobScheduler(existing.key);
      }
    }

    await queue.upsertJobScheduler(jobId, repeat, {
      name: jobName,
      opts: {
        // Backoff exponencial a partir de 30s: 30s → 1min → 2min. Falha de
        // job aqui é quase sempre banco ou Redis momentaneamente fora, e
        // insistir de imediato só piora.
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 24 * 3_600, count: 200 },
        removeOnFail: { age: 7 * 24 * 3_600 },
      },
    });
  }
}
