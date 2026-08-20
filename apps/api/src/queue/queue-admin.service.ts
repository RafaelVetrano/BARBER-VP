import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type {
  AdminQueueDetail,
  AdminQueueJobItem,
  AdminQueueSummary,
  AdminQueuesResponse,
} from '@barbervp/types';
import { ApiException } from '../common/errors/api.exception';
import {
  ALL_QUEUES,
  QUEUE_BILLING,
  QUEUE_MAINTENANCE,
  QUEUE_OUTBOX,
  QUEUE_SUBSCRIPTIONS,
  type QueueName,
} from './queue.constants';

/** Estados que o painel mostra, na ordem em que interessam a quem investiga. */
const LISTED_STATES = ['failed', 'active', 'delayed', 'waiting', 'completed'] as const;

/**
 * Painel de jobs do super admin.
 *
 * Tela própria em vez de bull-board: o `bull-board` traria um Express
 * paralelo com autenticação própria, fora do `JwtAuthGuard`/`RolesGuard` que
 * protegem todo o resto da API — um segundo portão para manter seguro em
 * troca de uma tabela que o design system já sabe desenhar.
 */
@Injectable()
export class QueueAdminService {
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @InjectQueue(QUEUE_OUTBOX) outbox: Queue,
    @InjectQueue(QUEUE_SUBSCRIPTIONS) subscriptions: Queue,
    @InjectQueue(QUEUE_BILLING) billing: Queue,
    @InjectQueue(QUEUE_MAINTENANCE) maintenance: Queue,
  ) {
    this.queues = {
      [QUEUE_OUTBOX]: outbox,
      [QUEUE_SUBSCRIPTIONS]: subscriptions,
      [QUEUE_BILLING]: billing,
      [QUEUE_MAINTENANCE]: maintenance,
    };
  }

  async listQueues(): Promise<AdminQueuesResponse> {
    const queues = await Promise.all(ALL_QUEUES.map((name) => this.summarize(name)));
    return { queues };
  }

  async detail(name: string, limit = 20): Promise<AdminQueueDetail> {
    const queue = this.resolve(name);
    const summary = await this.summarize(name as QueueName);

    // `getJobs` devolve do mais recente para o mais antigo dentro de cada
    // estado; pedir os N de cada um e cortar depois evita trazer uma fila
    // inteira de `completed` só para mostrar as últimas linhas.
    const jobs = await queue.getJobs([...LISTED_STATES], 0, limit - 1, false);

    const items: AdminQueueJobItem[] = await Promise.all(
      jobs.map(async (job) => ({
        id: String(job.id),
        name: job.name,
        state: await job.getState(),
        attemptsMade: job.attemptsMade,
        createdAt: new Date(job.timestamp).toISOString(),
        processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        failedReason: job.failedReason ?? null,
        // `returnvalue` é o resumo que cada processor devolve (quantas
        // mensagens saíram, quantas assinaturas renovaram). É o que faz o
        // painel valer mais que "verde/vermelho".
        result: (job.returnvalue as Record<string, unknown> | null) ?? null,
      })),
    );

    return { ...summary, jobs: items };
  }

  /** Dispara o job da fila agora, fora do cron. */
  async runNow(name: string): Promise<{ enqueued: true; jobId: string }> {
    const queue = this.resolve(name);
    const schedulers = await queue.getJobSchedulers();
    const jobName = schedulers[0]?.name ?? `${name}-manual`;

    const job = await queue.add(jobName, { trigger: 'manual' }, { attempts: 1 });

    return { enqueued: true, jobId: String(job.id) };
  }

  /** Reenfileira um job que falhou depois de esgotar as tentativas. */
  async retryJob(name: string, jobId: string): Promise<{ retried: true }> {
    const queue = this.resolve(name);
    const job = await queue.getJob(jobId);

    if (!job) {
      throw ApiException.notFound('Job não encontrado.');
    }

    await job.retry();
    return { retried: true };
  }

  private async summarize(name: QueueName): Promise<AdminQueueSummary> {
    const queue = this.queues[name];
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );
    const schedulers = await queue.getJobSchedulers();
    const next = schedulers[0]?.next;

    return {
      name,
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        paused: counts.paused ?? 0,
      },
      schedule: schedulers[0]
        ? {
            pattern: schedulers[0].pattern ?? null,
            every: schedulers[0].every ? Number(schedulers[0].every) : null,
            nextRunAt: next ? new Date(Number(next)).toISOString() : null,
          }
        : null,
    };
  }

  private resolve(name: string): Queue {
    const queue = this.queues[name as QueueName];
    if (!queue) {
      throw ApiException.notFound('Fila não encontrada.');
    }
    return queue;
  }
}
