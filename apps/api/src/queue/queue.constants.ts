/**
 * Nomes de fila e de job. Ficam num arquivo só porque são a única coisa que o
 * produtor e o consumidor precisam ter em comum — errar uma string aqui é um
 * job que some sem erro, e o compilador não pegaria.
 */

export const QUEUE_OUTBOX = 'outbox';
export const QUEUE_SUBSCRIPTIONS = 'subscriptions';
export const QUEUE_BILLING = 'billing';
export const QUEUE_MAINTENANCE = 'maintenance';
/**
 * Automações de CALENDÁRIO do WhatsApp (aniversário, reativação, avaliação).
 *
 * Fila própria, e não um job a mais na de manutenção, pelo mesmo motivo das
 * outras quatro: uma varredura de aniversariantes travada não pode segurar a
 * faxina de retenção, e as duas precisam aparecer separadas no painel de
 * filas — quando o dono pergunta "por que ninguém recebeu?", a resposta tem
 * de estar numa linha só.
 */
export const QUEUE_AUTOMATIONS = 'automations';

/** Todas as filas do projeto, na ordem em que aparecem no painel do admin. */
export const ALL_QUEUES = [
  QUEUE_OUTBOX,
  QUEUE_SUBSCRIPTIONS,
  QUEUE_BILLING,
  QUEUE_MAINTENANCE,
  QUEUE_AUTOMATIONS,
] as const;

export type QueueName = (typeof ALL_QUEUES)[number];

export const JOB_DISPATCH_OUTBOX = 'dispatch-outbox';
export const JOB_RENEW_SUBSCRIPTIONS = 'renew-subscriptions';
export const JOB_RUN_SAAS_BILLING = 'run-saas-billing';
export const JOB_CLEANUP_EXPIRED = 'cleanup-expired';
export const JOB_RUN_AUTOMATIONS = 'run-whatsapp-automations';

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
  [QUEUE_AUTOMATIONS]: 'automations-daily',
};
