/**
 * Nomes de fila e de job. Ficam num arquivo só porque são a única coisa que o
 * produtor e o consumidor precisam ter em comum — errar uma string aqui é um
 * job que some sem erro, e o compilador não pegaria.
 */

export const QUEUE_OUTBOX = 'outbox';
export const QUEUE_SUBSCRIPTIONS = 'subscriptions';
export const QUEUE_BILLING = 'billing';
export const QUEUE_MAINTENANCE = 'maintenance';

/** Todas as filas do projeto, na ordem em que aparecem no painel do admin. */
export const ALL_QUEUES = [
  QUEUE_OUTBOX,
  QUEUE_SUBSCRIPTIONS,
  QUEUE_BILLING,
  QUEUE_MAINTENANCE,
] as const;

export type QueueName = (typeof ALL_QUEUES)[number];

export const JOB_DISPATCH_OUTBOX = 'dispatch-outbox';
export const JOB_RENEW_SUBSCRIPTIONS = 'renew-subscriptions';
export const JOB_RUN_SAAS_BILLING = 'run-saas-billing';
export const JOB_CLEANUP_EXPIRED = 'cleanup-expired';

/**
 * Id fixo do job repetível de cada fila.
 *
 * BullMQ deriva a chave do repeat de (nome + cron + jobId). Fixando o `jobId`,
 * subir a API duas vezes — ou com duas réplicas — não cria dois agendamentos
 * do mesmo job: o segundo `upsertJobScheduler` reaproveita a chave.
 */
export const REPEAT_JOB_IDS: Record<QueueName, string> = {
  [QUEUE_OUTBOX]: 'outbox-drain',
  [QUEUE_SUBSCRIPTIONS]: 'subscriptions-daily',
  [QUEUE_BILLING]: 'billing-daily',
  [QUEUE_MAINTENANCE]: 'maintenance-daily',
};
