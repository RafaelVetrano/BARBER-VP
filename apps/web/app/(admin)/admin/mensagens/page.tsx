'use client';

import { useState } from 'react';
import {
  Badge,
  Card,
  EmptyState,
  ResponsiveTable,
  Skeleton,
  Tabs,
  type TableColumn,
} from '@barbervp/ui';
import type { AdminOutboxItem, AdminOutboxKind } from '@barbervp/types';
import { AdminShell } from '@/components/admin/admin-shell';
import { useAdminOutboxQuery } from '@/lib/admin/api/outbox';

type Filter = 'all' | AdminOutboxKind;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  SENT: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
};

const KIND_LABEL: Record<AdminOutboxKind, string> = {
  notification: 'WhatsApp',
  mail: 'E-mail',
};

const formatDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function MensagensPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const outboxQuery = useAdminOutboxQuery({
    page,
    perPage: 30,
    ...(filter === 'all' ? {} : { kind: filter }),
  });

  const columns: TableColumn<AdminOutboxItem>[] = [
    {
      key: 'kind',
      header: 'Canal',
      mobile: 'meta',
      render: (row) => <Badge tone="neutral">{KIND_LABEL[row.kind]}</Badge>,
    },
    { key: 'subject', header: 'Evento', mobile: 'title', render: (row) => row.subject },
    {
      key: 'recipient',
      header: 'Destinatário',
      mobile: 'subtitle',
      // Já chega mascarado do backend — o painel da plataforma não é lugar
      // para o telefone completo do cliente de outra empresa.
      render: (row) => <span className="font-mono text-[13px]">{row.recipient}</span>,
    },
    {
      key: 'tenant',
      header: 'Barbearia',
      mobile: 'meta',
      render: (row) => row.tenantName ?? <span className="text-fg-muted">plataforma</span>,
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
          {row.status}
          {row.attempts > 1 ? ` (${row.attempts}×)` : ''}
        </Badge>
      ),
    },
    {
      key: 'when',
      header: 'Enviada em',
      mobile: 'meta',
      render: (row) =>
        row.sentAt ? (
          formatDateTime(row.sentAt)
        ) : row.scheduledFor ? (
          <span className="text-fg-muted">agendada p/ {formatDateTime(row.scheduledFor)}</span>
        ) : (
          '—'
        ),
    },
  ];

  const meta = outboxQuery.data?.meta;

  return (
    <AdminShell activeKey="mensagens">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-xl font-bold text-fg">Mensagens enviadas</h1>
          <p className="text-sm text-fg-muted">
            Tudo que saiu pelos adapters de WhatsApp e e-mail. Com os drivers mock nada vai para
            fora — esta é a trilha que prova que a mensagem foi gerada, e com que corpo.
          </p>
        </div>

        <Tabs
          label="Filtrar por canal"
          variant="segmented"
          value={filter}
          onChange={(value) => {
            setFilter(value as Filter);
            setPage(1);
          }}
          items={[
            { value: 'all', label: 'Todos' },
            { value: 'notification', label: 'WhatsApp' },
            { value: 'mail', label: 'E-mail' },
          ]}
        />

        {outboxQuery.isLoading ? (
          <Skeleton className="h-64" />
        ) : (outboxQuery.data?.data ?? []).length === 0 ? (
          <EmptyState
            message="Nenhuma mensagem ainda"
            description="Assim que um agendamento, um OTP ou uma cobrança acontecer, a mensagem aparece aqui."
          />
        ) : (
          <>
            <ResponsiveTable
              columns={columns}
              rows={outboxQuery.data?.data ?? []}
              getRowKey={(row) => `${row.kind}-${row.id}`}
              caption="Mensagens"
            />

            {meta && meta.totalPages > 1 ? (
              <Card>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-fg-muted">
                    Página {meta.page} de {meta.totalPages} · {meta.total} mensagens
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-control border border-border px-3 py-1.5 text-fg disabled:opacity-40"
                      disabled={meta.page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className="rounded-control border border-border px-3 py-1.5 text-fg disabled:opacity-40"
                      disabled={meta.page >= meta.totalPages}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </AdminShell>
  );
}
