'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  EmptyState,
  PlusIcon,
  ResponsiveTable,
  Skeleton,
  useEstablishmentAuth,
  useToast,
  type BadgeTone,
  type MenuItem,
  type TableColumn,
} from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type {
  ClientPlanAdminItem,
  SubscriberItem,
  SubscriptionPaymentStatus,
} from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { FeatureLocked } from '@/components/dashboard/feature-locked';
import { BlockError, Panel } from '@/components/dashboard/blocks';
import { ClientPlanModal } from '@/components/dashboard/loyalty/client-plan-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { isFeatureGateError } from '@/lib/dashboard/feature-error';
import {
  useClientPlansQuery,
  useReactivateClientPlanMutation,
  useSubscriberActionMutation,
  useSubscribersQuery,
} from '@/lib/dashboard/api/loyalty';
import { useServicesQuery } from '@/lib/dashboard/api/catalog';

/** `assinaturasLocked` do protótipo (l.1508–1512). */
const LOCKED_BULLETS = [
  'Clientes mensalistas com cobrança recorrente',
  'Controle de usos do plano por mês',
  'Renovação automática',
];

const PAYMENT_LABEL: Record<SubscriptionPaymentStatus, string> = {
  PAID: 'Pago',
  PENDING: 'Pendente',
  OVERDUE: 'Atrasado',
  PAUSED: 'Pausado',
};

/** As cores da coluna "Pagamento" (`STATUS_ASSIN_COLORS`, protótipo l.6191). */
const PAYMENT_TONE: Record<SubscriptionPaymentStatus, BadgeTone> = {
  PAID: 'success',
  PENDING: 'warning',
  OVERDUE: 'danger',
  PAUSED: 'neutral',
};

/** `planoServicosLabel` do protótipo (l.4594): "4× Corte/mês, 2× Barba/mês". */
function planItemsLabel(plan: ClientPlanAdminItem): string {
  if (plan.items.length === 0) return '—';
  return plan.items.map((item) => `${item.quota}× ${item.serviceName}/mês`).join(', ');
}

const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';

/**
 * Aba **Fidelidade** (`Dashboard.dc.html` l.1497–1623).
 *
 * O protótipo foi revisado e ficou com UMA área: Assinaturas. As sub-abas
 * "Pontos" e "Sorteios" saíram do desenho — e saíram daqui junto, em vez de
 * serem completadas. Os pontos seguem vivos no produto (a comanda resgata, a
 * aba Clientes mostra o saldo); o que sumiu foi a tela de configuração deles.
 *
 * A aba inteira é do plano Avançado (`fidelidadeAssinaturas`) e o paywall é
 * INLINE, como no desenho (l.1503) — não é um overlay que embaça a tela.
 */
export default function FidelidadePage() {
  const { toast } = useToast();
  const router = useRouter();
  const { activeMembership } = useEstablishmentAuth();
  const isBarberRole = activeMembership?.role === 'BARBER';

  // `BARBER` toma 403 de PAPEL (não de plano) em `/loyalty/*`, e o nav nem
  // oferece o item — o `DashboardFuncionario.dc.html` não tem Fidelidade. Sem
  // esta guarda, quem digita a URL vê dois blocos de erro genérico e um botão
  // "Novo plano" que só sabe devolver 403.
  const plansQuery = useClientPlansQuery({ enabled: !isBarberRole });
  const subscribersQuery = useSubscribersQuery({ enabled: !isBarberRole });
  // O catálogo só é preciso dentro do modal; pedir junto evita o select vazio
  // no primeiro frame de quem clica em "Novo plano".
  const servicesQuery = useServicesQuery({ active: true, perPage: 100 });
  const reactivate = useReactivateClientPlanMutation();
  const subscriberAction = useSubscriberActionMutation();

  const [planModal, setPlanModal] = useState<{ open: boolean; plan: ClientPlanAdminItem | null }>({
    open: false,
    plan: null,
  });
  const [pendingAction, setPendingAction] = useState<
    { row: SubscriberItem; action: 'pause' | 'resume' | 'cancel' } | null
  >(null);

  if (isBarberRole) {
    return (
      <DashboardChrome activeKey="fidelidade">
        <h1 className="sr-only">Fidelidade</h1>
        <EmptyState
          message="As assinaturas são do dono e do gerente."
          description="Quando você atende um assinante, o uso do plano é debitado na comanda — é lá que a assinatura aparece para você."
          action={<Button onClick={() => router.push('/app/comandas')}>Ir para as comandas</Button>}
        />
      </DashboardChrome>
    );
  }

  // Um 403 do gate não é "nenhum plano cadastrado": sem tratar, o Essencial
  // veria uma tela vazia e nenhuma pista do motivo (regra 3 do enunciado).
  if (isFeatureGateError(plansQuery.error)) {
    return (
      <DashboardChrome activeKey="fidelidade">
        <h1 className="sr-only">Fidelidade</h1>
        <FeatureLocked
          title="Disponível no plano Avançado"
          description="Venda planos mensais (ex.: 4 cortes/mês), acompanhe o uso do ciclo de cada assinante e tenha receita previsível todo mês."
          benefits={LOCKED_BULLETS}
          minPlanLabel="Avançado"
        />
      </DashboardChrome>
    );
  }

  const plans = plansQuery.data ?? [];
  const subscribers = subscribersQuery.data ?? [];

  const handleReactivate = async (plan: ClientPlanAdminItem) => {
    try {
      await reactivate.mutateAsync(plan.id);
      toast({ message: 'Plano reativado.', tone: 'success' });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível reativar o plano.',
        tone: 'danger',
      });
    }
  };

  const runSubscriberAction = async () => {
    if (!pendingAction) return;
    const { row, action } = pendingAction;
    try {
      await subscriberAction.mutateAsync({ id: row.subscriptionId, action });
      toast({
        message:
          action === 'pause'
            ? `Assinatura de ${row.clientName} pausada.`
            : action === 'resume'
              ? `Assinatura de ${row.clientName} retomada.`
              : `Assinatura de ${row.clientName} cancelada.`,
        tone: 'success',
      });
      setPendingAction(null);
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível concluir a ação.',
        tone: 'danger',
      });
    }
  };

  const columns: TableColumn<SubscriberItem>[] = [
    {
      key: 'cliente',
      header: 'Cliente',
      mobile: 'title',
      render: (row) => <span className="font-semibold">{row.clientName}</span>,
    },
    {
      key: 'plano',
      header: 'Plano',
      mobile: 'subtitle',
      render: (row) => <span className="text-fg-muted">{row.planName}</span>,
    },
    {
      key: 'usos',
      header: 'Usos no mês',
      mobile: 'meta',
      render: (row) => <UsageMeter used={row.usedTotal} quota={row.quotaTotal} usages={row.usages} />,
    },
    {
      key: 'pagamento',
      header: 'Pagamento',
      mobile: 'meta',
      render: (row) => (
        <Badge tone={PAYMENT_TONE[row.paymentStatus]}>{PAYMENT_LABEL[row.paymentStatus]}</Badge>
      ),
    },
    {
      key: 'proxima',
      header: 'Próxima cobrança',
      mobile: 'meta',
      render: (row) => <span className="text-fg-muted">{dateLabel(row.nextChargeAt)}</span>,
    },
  ];

  // O menu do protótipo (l.1583) tem Pausar e Cancelar. "Retomar" entra porque
  // pausar aqui cria um estado que, sem ele, não teria volta pelo painel.
  const rowActions = (row: SubscriberItem): MenuItem[] => [
    row.status === 'PAUSED'
      ? { label: 'Retomar', onSelect: () => setPendingAction({ row, action: 'resume' }) }
      : { label: 'Pausar', onSelect: () => setPendingAction({ row, action: 'pause' }) },
    { label: 'Cancelar', destructive: true, onSelect: () => setPendingAction({ row, action: 'cancel' }) },
  ];

  return (
    <DashboardChrome activeKey="fidelidade">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-[15px] font-semibold text-fg">Assinaturas</h1>

        <div className="flex justify-end">
          <Button
            size="sm"
            iconLeft={<PlusIcon size={16} />}
            onClick={() => setPlanModal({ open: true, plan: null })}
          >
            Novo plano
          </Button>
        </div>

        {/* ── Cards dos planos ─────────────────────────────────────────── */}
        {plansQuery.isPending ? (
          <PlanCardsSkeleton />
        ) : plansQuery.isError ? (
          <BlockError label="os planos de assinatura" onRetry={() => void plansQuery.refetch()} />
        ) : plans.length === 0 ? (
          <EmptyState
            message="Nenhum plano de assinatura ainda."
            description="Crie o primeiro plano para vender mensalidades e ter receita recorrente."
            action={
              <Button onClick={() => setPlanModal({ open: true, plan: null })}>Criar plano</Button>
            }
          />
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))' }}
          >
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-[18px] ${plan.active ? '' : 'opacity-60'}`}
              >
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-[15px] font-semibold text-fg">{plan.name}</h2>
                  {!plan.active && <Badge tone="neutral">Arquivado</Badge>}
                </div>

                <p className="font-display text-[22px] font-bold text-gold">
                  {formatBRL(plan.priceCents)}
                  <span className="text-[13px] font-normal text-fg-muted">/mês</span>
                </p>

                <p className="text-[13px] text-fg-muted">{planItemsLabel(plan)}</p>

                <hr className="my-1 border-border" />

                <div className="flex justify-between text-[13px] font-medium">
                  <span>
                    {plan.subscriberCount} {plan.subscriberCount === 1 ? 'assinante' : 'assinantes'}
                  </span>
                  <span className="font-semibold text-success">MRR {formatBRL(plan.mrrCents)}</span>
                </div>

                {plan.active ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 self-start"
                    onClick={() => setPlanModal({ open: true, plan })}
                  >
                    Editar
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 self-start text-gold"
                    loading={reactivate.isPending && reactivate.variables === plan.id}
                    onClick={() => void handleReactivate(plan)}
                  >
                    Reativar
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}

        {/* ── Tabela de assinantes ─────────────────────────────────────── */}
        {subscribersQuery.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : subscribersQuery.isError ? (
          <BlockError label="os assinantes" onRetry={() => void subscribersQuery.refetch()} />
        ) : (
          <Panel>
            <ResponsiveTable
              columns={columns}
              rows={subscribers}
              getRowKey={(row) => row.subscriptionId}
              caption="Assinantes ativos, uso do ciclo e situação de pagamento"
              actions={rowActions}
              getActionsLabel={(row) => `Ações da assinatura de ${row.clientName}`}
              empty={
                <EmptyState
                  message="Nenhum assinante ainda."
                  description="Quando um cliente assinar um plano na página pública, ele aparece aqui com o uso do ciclo."
                />
              }
            />
          </Panel>
        )}
      </div>

      <ClientPlanModal
        open={planModal.open}
        onClose={() => setPlanModal({ open: false, plan: null })}
        plan={planModal.plan}
        services={servicesQuery.data?.data ?? []}
      />

      <ConfirmDialog
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={
          pendingAction?.action === 'pause'
            ? 'Pausar assinatura'
            : pendingAction?.action === 'resume'
              ? 'Retomar assinatura'
              : 'Cancelar assinatura'
        }
        description={subscriberActionText(pendingAction)}
        confirmLabel={
          pendingAction?.action === 'pause'
            ? 'Pausar'
            : pendingAction?.action === 'resume'
              ? 'Retomar'
              : 'Cancelar assinatura'
        }
        cancelLabel="Voltar"
        tone={pendingAction?.action === 'cancel' ? 'danger' : 'primary'}
        busy={subscriberAction.isPending}
        onConfirm={() => void runSubscriberAction()}
      />
    </DashboardChrome>
  );
}

/** A barrinha da coluna "Usos no mês" (protótipo l.1571–1577). */
function UsageMeter({
  used,
  quota,
  usages,
}: {
  used: number;
  quota: number;
  usages: SubscriberItem['usages'];
}) {
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  // O detalhe por serviço não cabe na barra, mas quem passa o mouse (ou usa
  // leitor de tela) precisa saber de que serviços o saldo é feito.
  const detail = usages.map((usage) => `${usage.serviceName} ${usage.used}/${usage.quota}`).join(' · ');

  return (
    <span className="flex items-center gap-2" title={detail || undefined}>
      <span className="w-8 text-xs font-semibold tabular-nums">
        {used}/{quota}
      </span>
      <span
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-label={`Usos do ciclo: ${detail || `${used} de ${quota}`}`}
        className="h-1.5 w-[70px] overflow-hidden rounded-full bg-border"
      >
        <span className="block h-full bg-gold" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

function subscriberActionText(
  pending: { row: SubscriberItem; action: 'pause' | 'resume' | 'cancel' } | null,
): string {
  if (!pending) return '';
  const name = pending.row.clientName;
  if (pending.action === 'pause') {
    return `A assinatura de ${name} para de faturar e o saldo do ciclo fica congelado até ser retomada.`;
  }
  if (pending.action === 'resume') {
    return `A assinatura de ${name} volta a faturar. Se o ciclo pausado já venceu, um ciclo novo começa com a cobrança e o saldo do zero.`;
  }
  return `A assinatura de ${name} é encerrada agora: ele perde os usos restantes do ciclo e não há nova cobrança. Não dá para desfazer.`;
}

/** Mesma altura dos cards finais — carregar não pode empurrar a tabela. */
function PlanCardsSkeleton() {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))' }}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-[214px] rounded-xl" />
      ))}
    </div>
  );
}
