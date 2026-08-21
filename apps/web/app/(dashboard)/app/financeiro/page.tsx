'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, EmptyState, PlusIcon, ResponsiveTable, Skeleton, Tabs, type TableColumn } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { AccountPayableItem, AccountReceivableItem, ValeItem } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { FeatureLocked } from '@/components/dashboard/feature-locked';
import { isFeatureGateError } from '@/lib/dashboard/feature-error';
import { CashRegisterCard } from '@/components/dashboard/finance/cash-register-card';
import { AccountModal } from '@/components/dashboard/finance/account-modal';
import { BankAccountModal } from '@/components/dashboard/finance/bank-account-modal';
import { ValeModal } from '@/components/dashboard/finance/vale-modal';
import { CashFlowChart } from '@/components/dashboard/finance/cash-flow-chart';
import {
  useBankAccountsQuery,
  useCashFlowQuery,
  usePayablesQuery,
  usePayPayableMutation,
  useReceivablesQuery,
  useReceiveReceivableMutation,
} from '@/lib/dashboard/api/finance';
import { useValesQuery } from '@/lib/dashboard/api/commissions';
import { useBarbersQuery } from '@/lib/dashboard/api/team';

const TABS = [
  { value: 'caixa', label: 'Caixa' },
  { value: 'pagar', label: 'Contas a pagar' },
  { value: 'receber', label: 'Contas a receber' },
  { value: 'vales', label: 'Vales' },
  { value: 'bancarias', label: 'Contas bancárias' },
  { value: 'fluxo', label: 'Fluxo de caixa' },
] as const;
type FinTab = (typeof TABS)[number]['value'];

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  PAID: 'success',
  RECEIVED: 'success',
  PENDING: 'warning',
  OVERDUE: 'danger',
};
const STATUS_LABEL: Record<string, string> = { PAID: 'Pago', RECEIVED: 'Recebido', PENDING: 'Pendente', OVERDUE: 'Vencido' };

/**
 * Upsell das abas de Financeiro que dependem de `contasPagarReceber`
 * (Profissional+). Sem isso, um tenant Essencial veria "Nenhuma conta a
 * pagar" — uma mentira, e o "bloqueio silencioso" que o enunciado proíbe.
 */
function FinanceGate() {
  return (
    <FeatureLocked
      title="Controle financeiro completo"
      description="Contas a pagar e a receber, vales, contas bancárias e fluxo de caixa — disponível a partir do plano Profissional."
      benefits={[
        'Contas a pagar e receber com vencimento e parcelas',
        'Vales descontados automaticamente da comissão',
        'Fluxo de caixa mensal, entradas vs. saídas',
      ]}
      minPlanLabel="Profissional"
    />
  );
}

export default function FinanceiroPage() {
  const [tab, setTab] = useState<FinTab>('caixa');
  const [modal, setModal] = useState<'payable' | 'receivable' | 'bank' | 'vale' | null>(null);

  const payablesQuery = usePayablesQuery({ perPage: 50 });
  const receivablesQuery = useReceivablesQuery({ perPage: 50 });
  const valesQuery = useValesQuery();
  const bankAccountsQuery = useBankAccountsQuery();
  const cashFlowQuery = useCashFlowQuery(6);
  const barbersQuery = useBarbersQuery();
  const payPayable = usePayPayableMutation();
  const receiveReceivable = useReceiveReceivableMutation();

  const payableColumns: TableColumn<AccountPayableItem>[] = [
    { key: 'description', header: 'Descrição', mobile: 'title', render: (row) => row.description },
    { key: 'category', header: 'Categoria', mobile: 'subtitle', render: (row) => row.category },
    { key: 'due', header: 'Vencimento', mobile: 'meta', render: (row) => new Date(row.dueDate).toLocaleDateString('pt-BR') },
    { key: 'amount', header: 'Valor', align: 'right', mobile: 'meta', render: (row) => formatBRL(row.amountCents) },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
    },
  ];

  const receivableColumns: TableColumn<AccountReceivableItem>[] = [
    { key: 'description', header: 'Descrição', mobile: 'title', render: (row) => row.description },
    { key: 'category', header: 'Categoria', mobile: 'subtitle', render: (row) => row.category },
    { key: 'due', header: 'Vencimento', mobile: 'meta', render: (row) => new Date(row.dueDate).toLocaleDateString('pt-BR') },
    { key: 'amount', header: 'Valor', align: 'right', mobile: 'meta', render: (row) => formatBRL(row.amountCents) },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
    },
  ];

  const valeColumns: TableColumn<ValeItem>[] = [
    { key: 'barber', header: 'Funcionário', mobile: 'title', render: (row) => row.barberName },
    { key: 'month', header: 'Mês', mobile: 'subtitle', render: (row) => row.referenceMonth },
    { key: 'reason', header: 'Motivo', mobile: 'subtitle', render: (row) => row.description ?? '—' },
    { key: 'amount', header: 'Valor', align: 'right', mobile: 'meta', render: (row) => formatBRL(row.amountCents) },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => <Badge tone={row.settled ? 'success' : 'warning'}>{row.settled ? 'Descontado' : 'Pendente'}</Badge>,
    },
  ];

  // Qualquer uma das queries com gate serve de sonda: o `FeatureGuard` do
  // backend recusa todas com o mesmo `contasPagarReceber`.
  const gated =
    isFeatureGateError(payablesQuery.error) ||
    isFeatureGateError(receivablesQuery.error) ||
    isFeatureGateError(bankAccountsQuery.error) ||
    isFeatureGateError(valesQuery.error);

  return (
    <DashboardChrome
      activeKey="financeiro"
      topbarActions={
        gated || tab === 'caixa' || tab === 'fluxo' ? undefined : tab === 'pagar' ? (
          <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setModal('payable')}>
            Nova conta
          </Button>
        ) : tab === 'receber' ? (
          <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setModal('receivable')}>
            Nova conta
          </Button>
        ) : tab === 'vales' ? (
          <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setModal('vale')}>
            Novo vale
          </Button>
        ) : (
          <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setModal('bank')}>
            Nova conta bancária
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Financeiro</h1>

        <Tabs label="Financeiro" value={tab} onChange={(v) => setTab(v as FinTab)} items={TABS.map((t) => ({ value: t.value, label: t.label }))} />

        {tab === 'caixa' && <CashRegisterCard />}

        {tab === 'pagar' && (gated ? <FinanceGate /> : (
          <ResponsiveTable
            columns={payableColumns}
            rows={payablesQuery.data?.data ?? []}
            getRowKey={(row) => row.id}
            caption="Contas a pagar"
            actions={(row) => (row.status === 'PAID' ? [] : [{ label: 'Marcar como paga', onSelect: () => payPayable.mutate(row.id) }])}
            empty={<EmptyState message="Nenhuma conta a pagar." />}
          />
        ))}

        {tab === 'receber' && (gated ? <FinanceGate /> : (
          <ResponsiveTable
            columns={receivableColumns}
            rows={receivablesQuery.data?.data ?? []}
            getRowKey={(row) => row.id}
            caption="Contas a receber"
            actions={(row) => (row.status === 'RECEIVED' ? [] : [{ label: 'Marcar como recebida', onSelect: () => receiveReceivable.mutate(row.id) }])}
            empty={<EmptyState message="Nenhuma conta a receber." />}
          />
        ))}

        {tab === 'vales' && (gated ? <FinanceGate /> : (
          <ResponsiveTable
            columns={valeColumns}
            rows={valesQuery.data ?? []}
            getRowKey={(row) => row.id}
            caption="Vales (adiantamentos)"
            empty={<EmptyState message="Nenhum vale registrado." />}
          />
        ))}

        {tab === 'bancarias' && (gated ? <FinanceGate /> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(bankAccountsQuery.data ?? []).map((account) => (
              <Card key={account.id}>
                <CardHeader title={account.name} description={account.bank ?? undefined} />
                <p className="mt-3 text-lg font-bold text-fg">{formatBRL(account.balanceCents)}</p>
              </Card>
            ))}
            {bankAccountsQuery.data?.length === 0 && <EmptyState message="Nenhuma conta bancária cadastrada." />}
          </div>
        ))}

        {tab === 'fluxo' && (gated ? <FinanceGate /> : (
          <Card>
            <CardHeader title="Fluxo de caixa" description="Entradas vs. saídas, últimos 6 meses" />
            <div className="mt-4">
              {cashFlowQuery.isLoading ? <Skeleton className="h-48 w-full" /> : <CashFlowChart months={cashFlowQuery.data?.months ?? []} />}
            </div>
          </Card>
        ))}
      </div>

      <AccountModal open={modal === 'payable'} onClose={() => setModal(null)} kind="payable" bankAccounts={bankAccountsQuery.data ?? []} />
      <AccountModal open={modal === 'receivable'} onClose={() => setModal(null)} kind="receivable" bankAccounts={bankAccountsQuery.data ?? []} />
      <BankAccountModal open={modal === 'bank'} onClose={() => setModal(null)} />
      <ValeModal open={modal === 'vale'} onClose={() => setModal(null)} barbers={barbersQuery.data ?? []} />
    </DashboardChrome>
  );
}
