'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, PlusIcon, useToast } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { AdminPlanItem } from '@barbervp/types';
import { AdminShell } from '../../components/admin-shell';
import { PlanModal } from '../../components/plan-modal';
import { useAdminPlansQuery, useArchiveAdminPlanMutation } from '../../lib/api/plans';

export default function PlanosPage() {
  const { toast } = useToast();
  const plansQuery = useAdminPlansQuery();
  const archive = useArchiveAdminPlanMutation();
  const [modal, setModal] = useState<{ open: boolean; plan: AdminPlanItem | null }>({ open: false, plan: null });

  const handleArchive = async (plan: AdminPlanItem) => {
    if (!confirm(`Arquivar o plano ${plan.name}? Tenants já assinantes não são afetados.`)) return;
    try {
      await archive.mutateAsync(plan.id);
      toast({ message: 'Plano arquivado.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível arquivar.', tone: 'danger' });
    }
  };

  return (
    <AdminShell
      activeKey="planos"
      topbarActions={
        <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setModal({ open: true, plan: null })}>
          Novo plano
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Planos do SaaS</h1>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(plansQuery.data ?? []).map((plan) => (
            <Card key={plan.id} highlighted={plan.isPopular}>
              <CardHeader
                title={plan.name}
                description={`${formatBRL(plan.priceCents)}/mês`}
                action={!plan.active ? <Badge tone="neutral">Arquivado</Badge> : undefined}
              />
              <p className="mt-2 text-xs text-fg-muted">
                {plan.maxBarbers === null ? 'Barbeiros ilimitados' : `Até ${plan.maxBarbers} barbeiro(s)`}
              </p>
              <p className="mt-1 text-sm font-semibold text-fg">{plan.tenantCount} tenant(s) assinante(s)</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setModal({ open: true, plan })}>
                  Editar
                </Button>
                {plan.active && (
                  <Button size="sm" variant="ghost" onClick={() => void handleArchive(plan)}>
                    Arquivar
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <PlanModal open={modal.open} onClose={() => setModal({ open: false, plan: null })} plan={modal.plan} />
    </AdminShell>
  );
}
