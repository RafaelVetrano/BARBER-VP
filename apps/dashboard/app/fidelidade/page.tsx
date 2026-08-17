'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, EmptyState, Input, PlusIcon, ResponsiveTable, Switch, Tabs, useToast, type TableColumn } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { ClientPlanAdminItem, LoyaltyClientBalance, RaffleItem, SubscriberItem } from '@barbervp/types';
import { DashboardChrome } from '../../components/dashboard-chrome';
import { FeatureLocked } from '../../components/feature-locked';
import { isFeatureGateError } from '../../lib/feature-error';
import { ClientPlanModal } from '../../components/loyalty/client-plan-modal';
import { RaffleModal } from '../../components/loyalty/raffle-modal';
import {
  useArchiveClientPlanMutation,
  useClientPlansQuery,
  useDrawRaffleMutation,
  useLoyaltyClientsQuery,
  useLoyaltyProgramQuery,
  useRafflesQuery,
  useSubscribersQuery,
  useUpdateLoyaltyProgramMutation,
} from '../../lib/api/loyalty';
import { useServicesQuery } from '../../lib/api/catalog';

const TABS = [
  { value: 'pontos', label: 'Pontos' },
  { value: 'sorteios', label: 'Sorteios' },
  { value: 'assinaturas', label: 'Assinaturas' },
] as const;
type LoyaltyTab = (typeof TABS)[number]['value'];

function PontosTab() {
  const programQuery = useLoyaltyProgramQuery();
  const clientsQuery = useLoyaltyClientsQuery();
  const updateProgram = useUpdateLoyaltyProgramMutation();

  const [gastoPorPonto, setGastoPorPonto] = useState('');
  const [pontosParaDesconto, setPontosParaDesconto] = useState('');
  const [valorDesconto, setValorDesconto] = useState('');

  const program = programQuery.data;

  if (isFeatureGateError(programQuery.error)) {
    return (
      <FeatureLocked
        title="Programa de fidelidade"
        description="Pontos por atendimento, resgate de desconto e histórico por cliente — disponível a partir do plano Profissional."
        benefits={['Pontos automáticos a cada comanda fechada', 'Resgate configurável (ex.: 100 pts = R$10 de desconto)', 'Saldo por cliente, sem planilha']}
        minPlanLabel="Profissional"
      />
    );
  }

  const clientColumns: TableColumn<LoyaltyClientBalance>[] = [
    { key: 'name', header: 'Cliente', mobile: 'title', render: (row) => row.name },
    { key: 'balance', header: 'Saldo', mobile: 'meta', render: (row) => `${row.balance} pts` },
    { key: 'earned', header: 'Último ganho', mobile: 'subtitle', render: (row) => (row.lastEarnedAt ? new Date(row.lastEarnedAt).toLocaleDateString('pt-BR') : '—') },
    { key: 'redeemed', header: 'Último resgate', mobile: 'meta', render: (row) => (row.lastRedeemedAt ? new Date(row.lastRedeemedAt).toLocaleDateString('pt-BR') : '—') },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Configuração do programa" />
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex items-center justify-between">
            <span className="text-sm text-fg">Programa ativo</span>
            <Switch checked={program?.active ?? false} onChange={(e) => updateProgram.mutate({ active: e.target.checked })} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Centavos gastos por ponto"
              placeholder={String(program?.gastoPorPonto ?? 100)}
              value={gastoPorPonto}
              onChange={(e) => setGastoPorPonto(e.target.value)}
              onBlur={() => gastoPorPonto && updateProgram.mutate({ gastoPorPonto: Number(gastoPorPonto) })}
            />
            <Input
              label="Pontos p/ desconto"
              placeholder={String(program?.pontosParaDesconto ?? 100)}
              value={pontosParaDesconto}
              onChange={(e) => setPontosParaDesconto(e.target.value)}
              onBlur={() => pontosParaDesconto && updateProgram.mutate({ pontosParaDesconto: Number(pontosParaDesconto) })}
            />
            <Input
              label="Valor do desconto (R$)"
              placeholder={program ? (program.valorDesconto / 100).toFixed(2) : '10,00'}
              value={valorDesconto}
              onChange={(e) => setValorDesconto(e.target.value)}
              onBlur={() => {
                if (!valorDesconto) return;
                updateProgram.mutate({ valorDesconto: Math.round(Number(valorDesconto.replace(',', '.')) * 100) });
              }}
            />
          </div>
          {program && (
            <p className="text-xs text-fg-muted">
              A cada R$ {(program.gastoPorPonto / 100).toFixed(2)} gastos → 1 ponto. {program.pontosParaDesconto} pontos
              resgatam {formatBRL(program.valorDesconto)} de desconto.
            </p>
          )}
        </div>
      </Card>

      <ResponsiveTable
        columns={clientColumns}
        rows={clientsQuery.data ?? []}
        getRowKey={(row) => row.clientId}
        caption="Saldo por cliente"
        empty={<EmptyState message="Nenhum ponto lançado ainda." />}
      />
    </div>
  );
}

function SorteiosTab() {
  const { toast } = useToast();
  const rafflesQuery = useRafflesQuery();
  const draw = useDrawRaffleMutation();
  const [modalOpen, setModalOpen] = useState(false);

  if (isFeatureGateError(rafflesQuery.error)) {
    return (
      <FeatureLocked
        title="Sorteios automáticos"
        description="Crie campanhas com cupons por pontos e sorteie o vencedor direto pelo painel — disponível a partir do plano Profissional."
        benefits={['Aviso automático por WhatsApp', 'Cupons proporcionais aos pontos de fidelidade', 'Histórico de sorteios encerrados']}
        minPlanLabel="Profissional"
      />
    );
  }

  const raffles = rafflesQuery.data ?? [];
  const active = raffles.filter((r) => r.status === 'ACTIVE');
  const finished = raffles.filter((r) => r.status !== 'ACTIVE');

  const handleDraw = async (raffle: RaffleItem) => {
    if (!confirm(`Sortear o vencedor de "${raffle.name}" agora?`)) return;
    try {
      const result = await draw.mutateAsync(raffle.id);
      toast({ message: `Vencedor: ${result.winnerName}`, tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível sortear.', tone: 'danger' });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setModalOpen(true)}>
          Novo sorteio
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-fg-muted">Ativos</p>
        {active.length === 0 && <EmptyState message="Nenhum sorteio ativo." />}
        {active.map((raffle) => (
          <Card key={raffle.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-base font-bold text-fg">{raffle.name}</p>
                <p className="text-xs text-fg-muted">{raffle.prize} · {raffle.participants} participantes</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void handleDraw(raffle)}>
                Sortear agora
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-fg-muted">Encerrados</p>
        {finished.length === 0 && <EmptyState message="Nenhum sorteio encerrado ainda." />}
        {finished.map((raffle) => (
          <Card key={raffle.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-base font-bold text-fg">{raffle.name}</p>
                <p className="text-xs text-fg-muted">{raffle.prize}</p>
              </div>
              <Badge tone="gold">Vencedor: {raffle.winnerName ?? '—'}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <RaffleModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function AssinaturasTab() {
  const plansQuery = useClientPlansQuery();
  const subscribersQuery = useSubscribersQuery();
  const servicesQuery = useServicesQuery({ active: true, perPage: 100 });
  const archivePlan = useArchiveClientPlanMutation();
  const [planModal, setPlanModal] = useState<{ open: boolean; plan: ClientPlanAdminItem | null }>({ open: false, plan: null });

  if (isFeatureGateError(plansQuery.error)) {
    return (
      <FeatureLocked
        title="Assinaturas de clientes"
        description="Venda planos mensais (ex.: 4 cortes/mês) e acompanhe o uso do ciclo de cada assinante — disponível no plano Avançado."
        benefits={['Cobrança recorrente automática', 'Cliente vê o uso do plano na própria conta', 'Ideal para previsibilidade de caixa']}
        minPlanLabel="Avançado"
      />
    );
  }

  const subscriberColumns: TableColumn<SubscriberItem>[] = [
    { key: 'client', header: 'Cliente', mobile: 'title', render: (row) => row.clientName },
    { key: 'plan', header: 'Plano', mobile: 'subtitle', render: (row) => row.planName },
    {
      key: 'usage',
      header: 'Uso do ciclo',
      mobile: 'meta',
      render: (row) => row.usages.map((u) => `${u.serviceName} ${u.used}/${u.quota}`).join(' · '),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => <Badge tone={row.status === 'ACTIVE' ? 'success' : row.status === 'PAST_DUE' ? 'danger' : 'neutral'}>{row.status}</Badge>,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setPlanModal({ open: true, plan: null })}>
          Novo plano
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(plansQuery.data ?? []).map((plan) => (
          <Card key={plan.id}>
            <CardHeader title={plan.name} description={`${formatBRL(plan.priceCents)}/mês`} />
            <p className="mt-2 text-xs text-fg-muted">{plan.items.map((i) => `${i.quota}× ${i.serviceName}`).join(', ')}</p>
            <p className="mt-2 text-sm font-semibold text-fg">{plan.subscriberCount} assinante(s)</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPlanModal({ open: true, plan })}>
                Editar
              </Button>
              {plan.active && (
                <Button size="sm" variant="ghost" onClick={() => archivePlan.mutate(plan.id)}>
                  Arquivar
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <ResponsiveTable
        columns={subscriberColumns}
        rows={subscribersQuery.data ?? []}
        getRowKey={(row) => row.subscriptionId}
        caption="Assinantes"
        empty={<EmptyState message="Nenhum assinante ainda." />}
      />

      <ClientPlanModal
        open={planModal.open}
        onClose={() => setPlanModal({ open: false, plan: null })}
        plan={planModal.plan}
        services={servicesQuery.data?.data ?? []}
      />
    </div>
  );
}

export default function FidelidadePage() {
  const [tab, setTab] = useState<LoyaltyTab>('pontos');

  return (
    <DashboardChrome activeKey="fidelidade">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Fidelidade</h1>
        <Tabs label="Fidelidade" variant="segmented" value={tab} onChange={(v) => setTab(v as LoyaltyTab)} items={TABS.map((t) => ({ value: t.value, label: t.label }))} />
        {tab === 'pontos' && <PontosTab />}
        {tab === 'sorteios' && <SorteiosTab />}
        {tab === 'assinaturas' && <AssinaturasTab />}
      </div>
    </DashboardChrome>
  );
}
