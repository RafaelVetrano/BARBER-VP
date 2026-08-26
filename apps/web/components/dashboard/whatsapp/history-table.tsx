'use client';

import { EmptyState, ResponsiveTable, Skeleton, type TableColumn } from '@barbervp/ui';
import type { WhatsappHistoryItem, WhatsappHistoryPage } from '@barbervp/types';
import { BlockError, Panel } from '@/components/dashboard/blocks';
import { AUTOMATION_LABELS } from './automation-labels';

/**
 * "Histórico de envios" — protótipo l.1693–1720.
 *
 * As linhas são o `NotificationOutbox` desta barbearia: com o driver mock,
 * TODA mensagem que as automações disparam passa por aqui. É o que torna a
 * aba verificável sem provedor de WhatsApp nenhum ligado.
 */
export function HistoryTable({
  page,
  timezone,
  isLoading,
  isError,
  onRetry,
}: {
  page: WhatsappHistoryPage | undefined;
  /** Fuso da barbearia (`GET /dashboard/shell`) — não o do navegador. */
  timezone: string | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const columns: TableColumn<WhatsappHistoryItem>[] = [
    {
      key: 'sentAt',
      header: 'Data/hora',
      mobile: 'meta',
      render: (row) => (
        <span className="whitespace-nowrap text-fg-muted">{formatMoment(row.sentAt, timezone)}</span>
      ),
    },
    {
      key: 'client',
      header: 'Cliente',
      mobile: 'title',
      render: (row) => (
        <span className="whitespace-nowrap font-semibold text-fg">
          {row.clientName ?? row.recipient}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      mobile: 'subtitle',
      render: (row) => (
        <span className="whitespace-nowrap text-fg-muted">
          {row.event ? AUTOMATION_LABELS[row.event] : 'Mensagem avulsa'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusLabel row={row} />,
    },
    {
      key: 'body',
      header: 'Conteúdo',
      render: (row) => (
        <span className="block max-w-[280px] truncate text-fg-muted" title={row.body}>
          {row.body}
        </span>
      ),
    },
  ];

  return (
    <Panel title="Histórico de envios">
      {isLoading && <Skeleton className="h-64 rounded-xl" />}

      {isError && !isLoading && <BlockError label="o histórico de envios" onRetry={onRetry} />}

      {page && !isLoading && (
        <ResponsiveTable
          caption="Mensagens de WhatsApp enviadas por esta barbearia"
          columns={columns}
          rows={page.items}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              message="Nenhuma mensagem enviada ainda. Assim que uma automação disparar, ela aparece aqui."
            />
          }
        />
      )}
    </Panel>
  );
}

/**
 * Os três estados do protótipo (`STATUS_MAP`, l.6071): entregue, enviado e
 * falhou. `PENDING` com data futura é o lembrete esperando a hora — o desenho
 * não previu esse caso, e ele é a maioria das linhas de uma barbearia ativa.
 */
function StatusLabel({ row }: { row: WhatsappHistoryItem }) {
  if (row.status === 'FAILED') {
    return <span className="whitespace-nowrap text-xs font-semibold text-danger">⚠ Falhou</span>;
  }
  if (row.delivered) {
    return <span className="whitespace-nowrap text-xs font-semibold text-success">✓✓ Entregue</span>;
  }
  return <span className="whitespace-nowrap text-xs font-semibold text-fg-muted">✓ Agendada</span>;
}

/** `dd/MM HH:mm` no fuso da barbearia — o formato da primeira coluna. */
function formatMoment(iso: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  })
    .format(new Date(iso))
    .replace(',', '');
}
