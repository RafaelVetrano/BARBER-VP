'use client';

import { useState } from 'react';
import { Badge, Button, EmptyState, PlusIcon, ResponsiveTable, Tabs, type TableColumn } from '@barbervp/ui';
import { formatBRL, formatDuration } from '@barbervp/types';
import type { ProductListItem, ServiceListItem } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { ServiceModal } from '@/components/dashboard/catalog/service-modal';
import { ProductModal } from '@/components/dashboard/catalog/product-modal';
import { useBarbersQuery } from '@/lib/dashboard/api/team';
import {
  useProductsQuery,
  useServicesQuery,
  useSetProductActiveMutation,
  useSetServiceActiveMutation,
} from '@/lib/dashboard/api/catalog';

export default function ServicosProdutosPage() {
  const [tab, setTab] = useState<'servicos' | 'produtos'>('servicos');

  const servicesQuery = useServicesQuery({ perPage: 100 });
  const productsQuery = useProductsQuery({ perPage: 100 });
  const barbersQuery = useBarbersQuery();
  const setServiceActive = useSetServiceActiveMutation();
  const setProductActive = useSetProductActiveMutation();

  const [serviceModal, setServiceModal] = useState<{ open: boolean; service: ServiceListItem | null }>({
    open: false,
    service: null,
  });
  const [productModal, setProductModal] = useState<{ open: boolean; product: ProductListItem | null }>({
    open: false,
    product: null,
  });

  const serviceColumns: TableColumn<ServiceListItem>[] = [
    { key: 'name', header: 'Serviço', mobile: 'title', render: (row) => row.name },
    {
      key: 'duration',
      header: 'Duração',
      mobile: 'subtitle',
      render: (row) => formatDuration(row.durationMin),
    },
    { key: 'price', header: 'Preço', align: 'right', mobile: 'meta', render: (row) => formatBRL(row.priceCents) },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => (row.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>),
    },
  ];

  const productColumns: TableColumn<ProductListItem>[] = [
    { key: 'name', header: 'Produto', mobile: 'title', render: (row) => row.name },
    { key: 'stock', header: 'Estoque', mobile: 'subtitle', render: (row) => `${row.stock} un.` },
    { key: 'price', header: 'Preço', align: 'right', mobile: 'meta', render: (row) => formatBRL(row.priceCents) },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.lowStock && <Badge tone="warning">Estoque baixo</Badge>}
          {row.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>}
        </div>
      ),
    },
  ];

  return (
    <DashboardChrome
      activeKey="servicos-produtos"
      topbarActions={
        <Button
          size="sm"
          iconLeft={<PlusIcon size={16} />}
          onClick={() =>
            tab === 'servicos'
              ? setServiceModal({ open: true, service: null })
              : setProductModal({ open: true, product: null })
          }
        >
          {tab === 'servicos' ? 'Novo serviço' : 'Novo produto'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Serviços & Produtos</h1>

        <Tabs
          label="Catálogo"
          variant="segmented"
          value={tab}
          onChange={(value) => setTab(value as 'servicos' | 'produtos')}
          items={[
            { value: 'servicos', label: 'Serviços', count: servicesQuery.data?.meta.total },
            { value: 'produtos', label: 'Produtos', count: productsQuery.data?.meta.total },
          ]}
        />

        {tab === 'servicos' ? (
          <ResponsiveTable
            columns={serviceColumns}
            rows={servicesQuery.data?.data ?? []}
            getRowKey={(row) => row.id}
            caption="Serviços do catálogo"
            onRowClick={(row) => setServiceModal({ open: true, service: row })}
            actions={(row) => [
              { label: 'Editar', onSelect: () => setServiceModal({ open: true, service: row }) },
              {
                label: row.active ? 'Desativar' : 'Reativar',
                destructive: row.active,
                onSelect: () => setServiceActive.mutate({ id: row.id, active: !row.active }),
              },
            ]}
            empty={<EmptyState message="Nenhum serviço cadastrado." />}
          />
        ) : (
          <ResponsiveTable
            columns={productColumns}
            rows={productsQuery.data?.data ?? []}
            getRowKey={(row) => row.id}
            caption="Produtos do estoque"
            onRowClick={(row) => setProductModal({ open: true, product: row })}
            actions={(row) => [
              { label: 'Editar', onSelect: () => setProductModal({ open: true, product: row }) },
              {
                label: row.active ? 'Desativar' : 'Reativar',
                destructive: row.active,
                onSelect: () => setProductActive.mutate({ id: row.id, active: !row.active }),
              },
            ]}
            empty={<EmptyState message="Nenhum produto cadastrado." />}
          />
        )}
      </div>

      <ServiceModal
        open={serviceModal.open}
        onClose={() => setServiceModal({ open: false, service: null })}
        service={serviceModal.service}
        barbers={barbersQuery.data ?? []}
      />
      <ProductModal
        open={productModal.open}
        onClose={() => setProductModal({ open: false, product: null })}
        product={productModal.product}
      />
    </DashboardChrome>
  );
}
