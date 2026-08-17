'use client';

import { useState } from 'react';
import { Badge, Button, EmptyState, PlusIcon, ResponsiveTable, Tabs, type TableColumn } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { OrderListItem, OrderStatus } from '@barbervp/types';
import { DashboardChrome } from '../../components/dashboard-chrome';
import { OpenOrderModal } from '../../components/pos/open-order-modal';
import { PosWorkspace } from '../../components/pos/pos-workspace';
import { useOrdersQuery } from '../../lib/api/pos';
import { useBarbersQuery } from '../../lib/api/team';

function methodLabel(method: string): string {
  return { PIX: 'Pix', CASH: 'Dinheiro', DEBIT: 'Débito', CREDIT: 'Crédito' }[method] ?? method;
}

export default function ComandasPage() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [status, setStatus] = useState<OrderStatus>('OPEN');

  const ordersQuery = useOrdersQuery({ status, perPage: 30 });
  const barbersQuery = useBarbersQuery();

  if (selectedOrderId) {
    return (
      <DashboardChrome activeKey="comandas">
        <PosWorkspace orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />
      </DashboardChrome>
    );
  }

  const columns: TableColumn<OrderListItem>[] = [
    { key: 'number', header: 'Nº', mobile: 'meta', render: (row) => `#${row.number}` },
    { key: 'client', header: 'Cliente', mobile: 'title', render: (row) => row.clientName ?? 'Cliente avulso' },
    { key: 'barber', header: 'Barbeiro', mobile: 'subtitle', render: (row) => row.barberName ?? '—' },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="font-semibold text-fg">{formatBRL(row.totalCents)}</span>,
    },
    {
      key: 'status',
      header: status === 'OPEN' ? 'Aberta às' : 'Pagamento',
      mobile: 'meta',
      render: (row) =>
        status === 'OPEN' ? (
          <span className="text-fg-muted">{new Date(row.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.paymentMethods.map((method, index) => (
              <Badge key={index} tone="neutral">
                {methodLabel(method)}
              </Badge>
            ))}
          </div>
        ),
    },
  ];

  return (
    <DashboardChrome
      activeKey="comandas"
      topbarActions={
        <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setOpenModal(true)}>
          Nova comanda
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Comandas</h1>

        <Tabs
          label="Comandas"
          variant="segmented"
          value={status}
          onChange={(value) => setStatus(value as OrderStatus)}
          items={[
            { value: 'OPEN', label: 'Abertas', count: status === 'OPEN' ? ordersQuery.data?.meta.total : undefined },
            { value: 'CLOSED', label: 'Fechadas' },
          ]}
        />

        <ResponsiveTable
          columns={columns}
          rows={ordersQuery.data?.data ?? []}
          getRowKey={(row) => row.id}
          caption={status === 'OPEN' ? 'Comandas abertas' : 'Comandas fechadas'}
          onRowClick={(row) => setSelectedOrderId(row.id)}
          empty={
            <EmptyState
              message={status === 'OPEN' ? 'Nenhuma comanda aberta.' : 'Nenhuma comanda fechada ainda.'}
            />
          }
        />
      </div>

      <OpenOrderModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        onOpened={(orderId) => setSelectedOrderId(orderId)}
        barbers={barbersQuery.data ?? []}
      />
    </DashboardChrome>
  );
}
