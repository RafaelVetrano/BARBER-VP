import { Module, type DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppConfigModule } from '../config/config.module';
import { CONFIG, type AppConfig } from '../config/configuration';
import { validateEnv } from '../config/env.schema';
import { ClientAccountModule } from '../client-account/client-account.module';
import { AdminModule } from '../admin/admin.module';
import { QUEUE_BILLING, QUEUE_MAINTENANCE, QUEUE_OUTBOX, QUEUE_SUBSCRIPTIONS } from './queue.constants';
import { QueueSchedulerService } from './queue-scheduler.service';
import { QueueAdminService } from './queue-admin.service';
import { QueueAdminController } from './queue-admin.controller';
import { OutboxProcessor } from './jobs/outbox.processor';
import { SubscriptionRenewalProcessor } from './jobs/subscription-renewal.processor';
import { SaasBillingProcessor } from './jobs/saas-billing.processor';
import { MaintenanceProcessor } from './jobs/maintenance.processor';
import { MaintenanceService } from './jobs/maintenance.service';

/**
 * Filas BullMQ (fase 09) — o que fecha as dívidas "BullMQ continua desligado"
 * das fases 04, 05 e 08.
 *
 * Quatro filas, uma por natureza de trabalho, em vez de uma fila só com N
 * tipos de job: assim uma renovação de assinatura travada não segura o
 * lembrete de agendamento de ninguém, e cada uma aparece separada no painel.
 *
 * Os processors só são registrados quando `QUEUE_WORKERS_ENABLED` está ligado.
 * Desligado, o módulo continua declarando as filas — a API segue enfileirando
 * e o painel de jobs segue lendo, só ninguém consome. É o que permite separar
 * réplica de web de réplica de worker sem outra imagem.
 *
 * A decisão precisa ser tomada na MONTAGEM do módulo (um `@Processor` vira
 * `Worker` no instante em que é registrado como provider), e por isso o módulo
 * é dinâmico: a lista de providers depende do env, e `@Module({})` estático
 * não tem como consultá-lo. Vale a mesma validação Zod do resto do boot — não
 * um `process.env` cru.
 */
const WORKER_PROVIDERS = [
  OutboxProcessor,
  SubscriptionRenewalProcessor,
  SaasBillingProcessor,
  MaintenanceProcessor,
];

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        connection: {
          url: config.redisUrl,
          // BullMQ exige `null` aqui: com um número, um bloqueio longo do
          // worker vira erro de comando em vez de espera.
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: { age: 24 * 3_600, count: 200 },
          removeOnFail: { age: 7 * 24 * 3_600 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_OUTBOX },
      { name: QUEUE_SUBSCRIPTIONS },
      { name: QUEUE_BILLING },
      { name: QUEUE_MAINTENANCE },
    ),
    ClientAccountModule,
    AdminModule,
  ],
  controllers: [QueueAdminController],
  providers: [MaintenanceService, QueueSchedulerService, QueueAdminService],
  exports: [MaintenanceService],
})
export class QueueModule {
  static register(): DynamicModule {
    const workersEnabled = validateEnv(process.env).QUEUE_WORKERS_ENABLED;

    return {
      module: QueueModule,
      providers: workersEnabled ? WORKER_PROVIDERS : [],
    };
  }
}
