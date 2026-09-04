'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  ResponsiveTable,
  Skeleton,
  type TableColumn,
} from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { BarberListItem, ValeItem } from '@barbervp/types';
import { useValesQuery } from '@/lib/dashboard/api/commissions';
import { ValeModal } from './vale-modal';
import { BlockError, Panel } from '../blocks';
import { formatDateBR } from './finance-shared';

/** `Julho` a partir de `2026-07` — o mês por extenso que o status cita. */
function monthName(referenceMonth: string): string {
  const [year, month] = referenceMonth.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Sub-aba **Vales** (`Dashboard.dc.html` l.951–985).
 *
 * A faixa dourada não é enfeite: o vale só existe porque vira desconto no
 * fechamento de comissão, e o status de cada linha diz exatamente em qual
 * competência isso acontece.
 */
export function ValesTab({ barbers }: { barbers: BarberListItem[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const valesQuery = useValesQuery();

  const columns: TableColumn<ValeItem>[] = [
    { key: 'barber', header: 'Funcionário', mobile: 'title', render: (row) => row.barberName },
    {
      key: 'date',
      header: 'Data',
      mobile: 'meta',
      render: (row) => <span className="tabular-nums text-fg-muted">{formatDateBR(row.date)}</span>,
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="font-semibold tabular-nums">{formatBRL(row.amountCents)}</span>,
    },
    {
      key: 'reason',
      header: 'Motivo',
      mobile: 'subtitle',
      render: (row) => <span className="text-fg-muted">{row.description ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => (
        <Badge tone={row.settled ? 'neutral' : 'warning'}>
          {row.settled
            ? `Descontado em ${monthName(row.referenceMonth)}`
            : `Descontar na comissão de ${monthName(row.referenceMonth)}`}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-[280px] flex-1 rounded-control border border-gold/35 bg-gold/10 px-4 py-3 text-[13px] text-gold">
          Este valor será deduzido automaticamente na tela de Comissões.
        </p>
        <Button className="whitespace-nowrap" onClick={() => setModalOpen(true)}>
          + Novo vale
        </Button>
      </div>

      {valesQuery.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : valesQuery.isError ? (
        <BlockError label="os vales" onRetry={() => void valesQuery.refetch()} />
      ) : (
        <Panel>
          <ResponsiveTable
            columns={columns}
            rows={valesQuery.data ?? []}
            getRowKey={(row) => row.id}
            caption="Vales e adiantamentos"
            empty={
              <EmptyState
                message="Nenhum vale registrado"
                description="Adiantamentos lançados aqui já entram descontados no fechamento de comissão."
                action={<Button onClick={() => setModalOpen(true)}>+ Novo vale</Button>}
              />
            }
          />
        </Panel>
      )}

      <ValeModal open={modalOpen} barbers={barbers} onClose={() => setModalOpen(false)} />
    </div>
  );
}
