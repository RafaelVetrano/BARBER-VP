'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, EmptyState, PlusIcon, Skeleton, useToast } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import { DashboardChrome } from '../../components/dashboard-chrome';
import { FeatureLocked } from '../../components/feature-locked';
import { isFeatureGateError } from '../../lib/feature-error';
import { RuleModal } from '../../components/commissions/rule-modal';
import { useClosePeriodMutation, useCommissionPeriodQuery, useCommissionRulesQuery } from '../../lib/api/commissions';
import { useBarbersQuery } from '../../lib/api/team';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function ComissoesPage() {
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ruleModal, setRuleModal] = useState<{ open: boolean; ruleId: string | null }>({ open: false, ruleId: null });
  const [rulesListOpen, setRulesListOpen] = useState(false);

  const periodQuery = useCommissionPeriodQuery(month);
  const rulesQuery = useCommissionRulesQuery();
  const barbersQuery = useBarbersQuery();
  const closePeriod = useClosePeriodMutation();

  const period = periodQuery.data;
  const editingRule = rulesQuery.data?.find((r) => r.id === ruleModal.ruleId) ?? null;

  const handleClosePeriod = async () => {
    if (!confirm(`Fechar o período de ${month}? A taxa final trava e não pode ser recalculada depois.`)) return;
    try {
      await closePeriod.mutateAsync({ month });
      toast({ message: 'Período fechado.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível fechar o período.', tone: 'danger' });
    }
  };

  // Comissões inteira depende de `comissoes` (Profissional+) — sem tratar o
  // 403, um tenant Essencial veria "Nenhuma comissão neste período", que é
  // falso e esconde o motivo real.
  if (isFeatureGateError(periodQuery.error)) {
    return (
      <DashboardChrome activeKey="comissoes">
        <div className="flex flex-col gap-5">
          <h1 className="font-display text-xl font-bold text-fg">Comissões</h1>
          <FeatureLocked
            title="Comissões automáticas"
            description="Regra por barbeiro (percentual único ou faixas por faturamento), extrato do período e fechamento com desconto de vales — disponível a partir do plano Profissional."
            benefits={[
              'Comissão calculada sozinha a cada comanda fechada',
              'Faixas por faturamento (ex.: 40% até R$5.000, 50% acima)',
              'Vales descontados automaticamente no fechamento do mês',
            ]}
            minPlanLabel="Profissional"
          />
        </div>
      </DashboardChrome>
    );
  }

  return (
    <DashboardChrome
      activeKey="comissoes"
      topbarActions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRulesListOpen((v) => !v)}>
            Regras
          </Button>
          {!period?.closed && (
            <Button size="sm" onClick={() => void handleClosePeriod()} loading={closePeriod.isPending}>
              Fechar período
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold text-fg">Comissões</h1>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 rounded-control border border-border bg-surface-2 px-3 text-sm text-fg outline-none"
            />
            {period && <Badge tone={period.closed ? 'success' : 'warning'}>{period.closed ? 'Período fechado' : 'Em aberto'}</Badge>}
          </div>
        </div>

        {rulesListOpen && (
          <Card>
            <CardHeader
              title="Regras de comissão"
              action={
                <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setRuleModal({ open: true, ruleId: null })}>
                  Nova regra
                </Button>
              }
            />
            <ul className="mt-3 flex flex-col gap-2">
              {(rulesQuery.data ?? []).map((rule) => (
                <li key={rule.id}>
                  <button
                    type="button"
                    onClick={() => setRuleModal({ open: true, ruleId: rule.id })}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left hover:border-gold"
                  >
                    <div>
                      <p className="text-sm font-semibold text-fg">{rule.name}</p>
                      <p className="text-xs text-fg-muted">
                        {rule.type === 'FIXED' ? `${(rule.percentBps ?? 0) / 100}% fixo` : 'Faixas por faturamento'} · {rule.barberIds.length} barbeiro(s)
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {periodQuery.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : period && period.barbers.length > 0 ? (
          <div className="flex flex-col gap-3">
            {period.barbers.map((barber) => (
              <Card key={barber.barberId}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                  onClick={() => setExpanded((current) => (current === barber.barberId ? null : barber.barberId))}
                >
                  <div>
                    <p className="font-display text-base font-bold text-fg">{barber.barberName}</p>
                    <p className="text-xs text-fg-muted">{barber.ruleName ?? 'Sem regra vinculada'} · {barber.atendimentos} atendimentos</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-fg-muted">Faturado (serviços)</p>
                      <p className="text-sm font-semibold text-fg">{formatBRL(barber.faturadoServicosCents)}</p>
                    </div>
                    {barber.valeCents > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-fg-muted">Vale</p>
                        <p className="text-sm font-semibold text-danger">−{formatBRL(barber.valeCents)}</p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-xs text-fg-muted">Comissão</p>
                      <p className="text-base font-bold text-gold">{formatBRL(barber.totalCents)}</p>
                    </div>
                    <Badge tone={barber.status === 'PAID' ? 'success' : 'warning'}>{barber.status === 'PAID' ? 'Fechado' : 'Aberto'}</Badge>
                  </div>
                </button>

                {expanded === barber.barberId && (
                  <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                    {barber.extrato.map((entry, index) => (
                      <li key={index} className="flex items-center justify-between text-sm">
                        <span className="text-fg-muted">
                          {new Date(entry.date).toLocaleDateString('pt-BR')} · {entry.clientName} · {entry.serviceName}
                        </span>
                        <span className="font-semibold text-fg">{formatBRL(entry.amountCents)}</span>
                      </li>
                    ))}
                    {barber.extrato.length === 0 && <li className="text-sm text-fg-muted">Sem atendimentos no período.</li>}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState message="Nenhuma comissão neste período." />
        )}
      </div>

      <RuleModal
        open={ruleModal.open}
        onClose={() => setRuleModal({ open: false, ruleId: null })}
        rule={editingRule}
        barbers={barbersQuery.data ?? []}
      />
    </DashboardChrome>
  );
}
