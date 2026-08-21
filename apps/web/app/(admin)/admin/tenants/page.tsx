'use client';

import { useState } from 'react';
import { Badge, Input, ResponsiveTable, Select, type TableColumn } from '@barbervp/ui';
import type { AdminTenantListItem } from '@barbervp/types';
import { AdminShell } from '@/components/admin/admin-shell';
import { TenantDetailDrawer } from '@/components/admin/tenant-detail-drawer';
import { useAdminTenantsQuery } from '@/lib/admin/api/tenants';
import { useAdminPlansQuery } from '@/lib/admin/api/plans';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  TRIAL: 'neutral',
  SUSPENDED: 'danger',
  CANCELED: 'neutral',
};

export default function TenantsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const tenantsQuery = useAdminTenantsQuery({ search: search || undefined, status: status || undefined, perPage: 30 });
  const plansQuery = useAdminPlansQuery();

  const columns: TableColumn<AdminTenantListItem>[] = [
    { key: 'name', header: 'Barbearia', mobile: 'title', render: (row) => row.name },
    { key: 'slug', header: 'Slug', mobile: 'subtitle', render: (row) => row.slug },
    { key: 'plan', header: 'Plano', mobile: 'meta', render: (row) => row.planName ?? '—' },
    { key: 'barbers', header: 'Barbeiros', align: 'right', mobile: 'meta', render: (row) => row.barberCount },
    { key: 'appointments', header: 'Agend. no mês', align: 'right', mobile: 'meta', render: (row) => row.appointmentsThisMonth },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
  ];

  return (
    <AdminShell activeKey="tenants">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Tenants</h1>

        <div className="flex flex-wrap gap-3">
          <Input placeholder="Buscar por nome ou slug" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'TRIAL', label: 'Trial' },
              { value: 'ACTIVE', label: 'Ativo' },
              { value: 'SUSPENDED', label: 'Suspenso' },
              { value: 'CANCELED', label: 'Cancelado' },
            ]}
          />
        </div>

        <ResponsiveTable
          columns={columns}
          rows={tenantsQuery.data?.data ?? []}
          getRowKey={(row) => row.id}
          caption="Tenants"
          onRowClick={(row) => setSelectedTenantId(row.id)}
        />
      </div>

      <TenantDetailDrawer tenantId={selectedTenantId} onClose={() => setSelectedTenantId(null)} plans={plansQuery.data ?? []} />
    </AdminShell>
  );
}
