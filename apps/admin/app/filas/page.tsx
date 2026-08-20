'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ResponsiveTable,
  Skeleton,
  StatCard,
  useToast,
  type TableColumn,
} from '@barbervp/ui';
import type { AdminQueueJobItem, AdminQueueSummary } from '@barbervp/types';
import { AdminShell } from '../../components/admin-shell';
import {
  useAdminQueueDetailQuery,
  useAdminQueuesQuery,
  useRetryJobMutation,
  useRunQueueMutation,
} from '../../lib/api/queues';

/** Nome técnico da fila → nome que quem opera a plataforma reconhece. */
const QUEUE_LABEL: Record<string, string> = {
  outbox: 'Mensagens (WhatsApp e e-mail)',
  subscriptions: 'Renovação de assinaturas',
  billing: 'Cobrança do SaaS',
  maintenance: 'Faxina de dados expirados',
};

const QUEUE_HINT: Record<string, string> = {
  outbox: 'Entrega os lembretes de agendamento no horário marcado.',
  subscriptions: 'Vira o ciclo das assinaturas de cliente vencidas.',
  billing: 'Gera as faturas dos tenants com período vencido.',
  maintenance: 'Apaga OTP, sessões e mensagens fora da retenção.',
};

const STATE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  completed: 'success',
  active: 'info',
  waiting: 'neutral',
  delayed: 'neutral',
  failed: 'danger',
};

const formatDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** `every` em milissegundos vira "a cada 1 min"; cron vira o próprio padrão. */
function describeSchedule(queue: AdminQueueSummary): string {
  if (!queue.schedule) {
    return 'sem agendamento registrado';
  }
  if (queue.schedule.every) {
    const minutes = Math.round(queue.schedule.every / 60_000);
    return minutes >= 1 ? `a cada ${minutes} min` : `a cada ${queue.schedule.every / 1_000}s`;
  }
  return queue.schedule.pattern ? `cron ${queue.schedule.pattern}` : 'agendado';
}

export default function FilasPage() {
  const { toast } = useToast();
  const queuesQuery = useAdminQueuesQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const detailQuery = useAdminQueueDetailQuery(selected);
  const runQueue = useRunQueueMutation();
  const retryJob = useRetryJobMutation();

  const handleRun = async (name: string) => {
    try {
      await runQueue.mutateAsync(name);
      toast({ message: 'Job enfileirado — o resultado aparece em instantes.', tone: 'success' });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível disparar o job.',
        tone: 'danger',
      });
    }
  };

  const jobColumns: TableColumn<AdminQueueJobItem>[] = [
    { key: 'name', header: 'Job', mobile: 'title', render: (row) => row.name },
    {
      key: 'state',
      header: 'Estado',
      mobile: 'meta',
      render: (row) => <Badge tone={STATE_TONE[row.state] ?? 'neutral'}>{row.state}</Badge>,
    },
    {
      key: 'finished',
      header: 'Terminou em',
      mobile: 'meta',
      render: (row) => formatDateTime(row.finishedAt),
    },
    {
      key: 'attempts',
      header: 'Tentativas',
      align: 'right',
      mobile: 'meta',
      render: (row) => row.attemptsMade,
    },
    {
      key: 'result',
      header: 'Resultado',
      mobile: 'subtitle',
      render: (row) =>
        row.failedReason ? (
          <span className="text-danger">{row.failedReason}</span>
        ) : (
          // O resumo que o processor devolve — é o que faz o painel valer
          // mais que "verde/vermelho".
          <span className="text-fg-muted">
            {row.result ? JSON.stringify(row.result) : '—'}
          </span>
        ),
    },
  ];

  return (
    <AdminShell activeKey="filas">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-xl font-bold text-fg">Filas e jobs</h1>
          <p className="text-sm text-fg-muted">
            Quatro filas BullMQ, cada uma com o seu agendamento. &ldquo;Rodar agora&rdquo; dispara
            fora do horário, sem esperar o próximo ciclo.
          </p>
        </div>

        {queuesQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-32" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(queuesQuery.data?.queues ?? []).map((queue) => (
              <button
                key={queue.name}
                type="button"
                onClick={() => setSelected(queue.name === selected ? null : queue.name)}
                className="text-left"
                aria-pressed={queue.name === selected}
              >
                <StatCard
                  label={QUEUE_LABEL[queue.name] ?? queue.name}
                  value={queue.counts.failed > 0 ? `${queue.counts.failed} falha(s)` : 'ok'}
                  hint={`${describeSchedule(queue)} · próximo ${formatDateTime(
                    queue.schedule?.nextRunAt ?? null,
                  )}`}
                />
              </button>
            ))}
          </div>
        )}

        {(queuesQuery.data?.queues ?? []).map((queue) => (
          <Card key={queue.name}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="font-semibold text-fg">{QUEUE_LABEL[queue.name] ?? queue.name}</p>
                <p className="text-[13px] text-fg-muted">{QUEUE_HINT[queue.name]}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{queue.counts.completed} concluídos</Badge>
                <Badge tone={queue.counts.failed > 0 ? 'danger' : 'neutral'}>
                  {queue.counts.failed} falhas
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected(queue.name === selected ? null : queue.name)}
                >
                  {queue.name === selected ? 'Ocultar jobs' : 'Ver jobs'}
                </Button>
                <Button
                  size="sm"
                  loading={runQueue.isPending && runQueue.variables === queue.name}
                  onClick={() => void handleRun(queue.name)}
                >
                  Rodar agora
                </Button>
              </div>
            </div>

            {queue.name === selected ? (
              <div className="mt-4">
                {detailQuery.isLoading ? (
                  <Skeleton className="h-40" />
                ) : (detailQuery.data?.jobs ?? []).length === 0 ? (
                  <EmptyState
                    message="Nenhum job registrado ainda"
                    description="Os jobs aparecem aqui depois da primeira execução."
                  />
                ) : (
                  <ResponsiveTable
                    columns={jobColumns}
                    rows={detailQuery.data?.jobs ?? []}
                    getRowKey={(row) => row.id}
                    caption={`Últimos jobs — ${QUEUE_LABEL[queue.name] ?? queue.name}`}
                    actions={(row) =>
                      row.state === 'failed'
                        ? [
                            {
                              label: 'Tentar de novo',
                              onSelect: () =>
                                retryJob.mutate({ name: queue.name, jobId: row.id }),
                            },
                          ]
                        : []
                    }
                  />
                )}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
