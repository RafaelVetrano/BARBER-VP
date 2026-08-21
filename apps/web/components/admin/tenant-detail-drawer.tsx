'use client';

import { useState } from 'react';
import { Badge, Button, Drawer, Select, Skeleton, useToast } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { AdminPlanItem } from '@barbervp/types';
import {
  useAdminTenantQuery,
  useChangeTenantPlanMutation,
  useImpersonateMutation,
  useReactivateTenantMutation,
  useSuspendTenantMutation,
} from '@/lib/admin/api/tenants';
import { DASHBOARD_URL } from '@/lib/urls';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  TRIAL: 'neutral',
  SUSPENDED: 'danger',
  CANCELED: 'neutral',
};

export function TenantDetailDrawer({
  tenantId,
  onClose,
  plans,
}: {
  tenantId: string | null;
  onClose: () => void;
  plans: AdminPlanItem[];
}) {
  const { toast } = useToast();
  const tenantQuery = useAdminTenantQuery(tenantId);
  const suspend = useSuspendTenantMutation(tenantId ?? '');
  const reactivate = useReactivateTenantMutation(tenantId ?? '');
  const changePlan = useChangeTenantPlanMutation(tenantId ?? '');
  const impersonate = useImpersonateMutation(tenantId ?? '');
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const tenant = tenantQuery.data;

  const handleImpersonate = async () => {
    try {
      const result = await impersonate.mutateAsync();
      const target = `${DASHBOARD_URL}/impersonar?tenant=${result.tenantId}&slug=${result.tenantSlug}#token=${result.accessToken}`;
      window.location.assign(target);
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível impersonar.', tone: 'danger' });
    }
  };

  const handleChangePlan = async () => {
    if (!selectedPlanId) return;
    try {
      await changePlan.mutateAsync({ planId: selectedPlanId });
      toast({ message: 'Plano alterado.', tone: 'success' });
      setSelectedPlanId('');
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível trocar o plano.', tone: 'danger' });
    }
  };

  return (
    <Drawer open={!!tenantId} onClose={onClose} title={tenant?.name ?? 'Tenant'}>
      {tenantQuery.isLoading || !tenant ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">{tenant.slug}</span>
            <Badge tone={STATUS_TONE[tenant.status] ?? 'neutral'}>{tenant.status}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg-muted">Barbeiros ativos</p>
              <p className="text-lg font-bold text-fg">{tenant.metrics.barberCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg-muted">Clientes</p>
              <p className="text-lg font-bold text-fg">{tenant.metrics.clientCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg-muted">Agendamentos no mês</p>
              <p className="text-lg font-bold text-fg">{tenant.metrics.appointmentsThisMonth}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg-muted">Faturamento no mês</p>
              <p className="text-lg font-bold text-fg">{formatBRL(tenant.metrics.revenueThisMonthCents)}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-sm font-semibold text-fg">Plano atual</p>
            <p className="text-sm text-fg-muted">
              {tenant.plan ? `${tenant.plan.name} · ${formatBRL(tenant.plan.priceCents)}/mês` : 'Sem plano'}
            </p>
            {tenant.subscription && (
              <p className="text-xs text-fg-muted">
                Ciclo até {new Date(tenant.subscription.currentPeriodEnd).toLocaleDateString('pt-BR')} ·{' '}
                {tenant.subscription.failedAttempts > 0 ? `${tenant.subscription.failedAttempts} recusa(s) seguida(s)` : 'em dia'}
              </p>
            )}
            <div className="flex items-end gap-2">
              <Select
                label="Trocar plano"
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                options={[{ value: '', label: 'Selecione...' }, ...plans.map((p) => ({ value: p.id, label: p.name }))]}
              />
              <Button size="sm" variant="outline" disabled={!selectedPlanId} loading={changePlan.isPending} onClick={() => void handleChangePlan()}>
                Aplicar
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-sm font-semibold text-fg">Equipe</p>
            <ul className="flex flex-col gap-1.5">
              {tenant.memberships.map((membership) => (
                <li key={membership.userId} className="flex items-center justify-between text-sm">
                  <span className="text-fg">{membership.name}</span>
                  <span className="text-xs text-fg-muted">{membership.role}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            {tenant.status === 'SUSPENDED' ? (
              <Button loading={reactivate.isPending} onClick={() => reactivate.mutate()}>
                Reativar tenant
              </Button>
            ) : (
              <Button variant="danger" loading={suspend.isPending} onClick={() => suspend.mutate()}>
                Suspender tenant
              </Button>
            )}
            <Button variant="outline" loading={impersonate.isPending} disabled={tenant.status === 'SUSPENDED'} onClick={() => void handleImpersonate()}>
              Impersonar OWNER
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
