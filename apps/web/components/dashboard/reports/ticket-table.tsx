'use client';

import { ResponsiveTable, type TableColumn } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { TicketByBarber } from '@barbervp/types';

/**
 * "Ticket médio por barbeiro" (`Dashboard.dc.html` l.1465–1489).
 *
 * `Atend.` é a contagem de COMANDAS FECHADAS — o mesmo denominador do ticket
 * médio do Dashboard e do card acima. Contar itens de serviço daria um número
 * maior e um ticket menor, e as duas telas passariam a discordar.
 */
export function TicketTable({ rows }: { rows: TicketByBarber[] }) {
  const columns: TableColumn<TicketByBarber>[] = [
    {
      key: 'barbeiro',
      header: 'Barbeiro',
      mobile: 'title',
      render: (row) => <span className="font-medium text-fg">{row.barberName}</span>,
    },
    {
      key: 'atendimentos',
      header: 'Atend.',
      align: 'right',
      mobile: 'subtitle',
      // No card do celular a coluna perde o cabeçalho, e um "155" solto não diz
      // nada; a unidade entra no próprio valor abaixo de `md`.
      render: (row) => (
        <span className="tabular-nums text-fg-muted">
          {row.orders}
          <span className="md:hidden"> atend.</span>
        </span>
      ),
    },
    {
      key: 'ticket',
      header: 'Ticket médio',
      align: 'right',
      mobile: 'meta',
      render: (row) => (
        <span className="font-semibold tabular-nums text-gold">{formatBRL(row.ticketCents)}</span>
      ),
    },
  ];

  return (
    <ResponsiveTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.barberId}
      caption="Ticket médio por barbeiro no período"
    />
  );
}
