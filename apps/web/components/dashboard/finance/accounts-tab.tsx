'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  ResponsiveTable,
  Skeleton,
  useToast,
  type TableColumn,
} from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type {
  AccountPayableItem,
  AccountReceivableItem,
  AccountSummary,
  BankAccountItem,
} from '@barbervp/types';
import {
  usePayPayableMutation,
  usePayablesQuery,
  useReceivablesQuery,
  useReceiveReceivableMutation,
} from '@/lib/dashboard/api/finance';
import { AccountModal } from './account-modal';
import { BlockError, FinanceStat, Panel, StatGrid, StatGridSkeleton } from '../blocks';
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_TONE,
  financeErrorMessage,
  formatDateBR,
  installmentLabel,
} from './finance-shared';

const PER_PAGE = 50;

/** O que muda entre "a pagar" e "a receber" — o resto da sub-aba é idêntico. */
const COPY = {
  payable: {
    partyHeader: 'Fornecedor',
    overdueLabel: 'Vencidas',
    next7Label: 'Vence em 7 dias',
    actionLabel: 'Marcar como pago',
    settledStatus: 'PAID' as const,
    emptyTitle: 'Nenhuma conta a pagar',
    emptyDescription: 'Cadastre aluguel, energia, fornecedores — e acompanhe o que vence.',
    errorLabel: 'as contas a pagar',
    caption: 'Contas a pagar',
  },
  receivable: {
    partyHeader: 'Cliente',
    overdueLabel: 'Vencidas',
    next7Label: 'A receber em 7 dias',
    actionLabel: 'Marcar como recebido',
    settledStatus: 'RECEIVED' as const,
    emptyTitle: 'Nenhuma conta a receber',
    emptyDescription: 'Mensalidades e vendas parceladas entram aqui com data de vencimento.',
    errorLabel: 'as contas a receber',
    caption: 'Contas a receber',
  },
};

/**
 * Sub-abas **Contas a pagar** (l.835) e **Contas a receber** (l.893).
 *
 * Mesma estrutura nas duas: 3 KPIs, "+ Nova conta" à direita e a tabela com o
 * botão de liquidação na linha. Os KPIs vêm somados do servidor — calcular
 * aqui daria o total da PÁGINA, que é outro número.
 */
export function AccountsTab({
  kind,
  bankAccounts,
}: {
  kind: 'payable' | 'receivable';
  bankAccounts: BankAccountItem[];
}) {
  const { toast } = useToast();
  const copy = COPY[kind];
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const payablesQuery = usePayablesQuery({ page, perPage: PER_PAGE });
  const receivablesQuery = useReceivablesQuery({ page, perPage: PER_PAGE });
  const query = kind === 'payable' ? payablesQuery : receivablesQuery;

  const payMutation = usePayPayableMutation();
  const receiveMutation = useReceiveReceivableMutation();
  const settle = kind === 'payable' ? payMutation : receiveMutation;

  async function onSettle(id: string) {
    try {
      await settle.mutateAsync(id);
      toast({
        message: kind === 'payable' ? 'Conta marcada como paga.' : 'Conta marcada como recebida.',
        tone: 'success',
      });
    } catch (error) {
      toast({
        message: financeErrorMessage(error, 'Não foi possível atualizar a conta.'),
        tone: 'danger',
      });
    }
  }

  type Row = AccountPayableItem | AccountReceivableItem;
  const partyOf = (row: Row) =>
    'supplier' in row ? row.supplier : (row as AccountReceivableItem).customer;

  const columns: TableColumn<Row>[] = [
    { key: 'desc', header: 'Descrição', mobile: 'title', render: (row) => row.description },
    {
      key: 'category',
      header: 'Categoria',
      mobile: 'subtitle',
      render: (row) => <span className="text-fg-muted">{row.category}</span>,
    },
    {
      key: 'party',
      header: copy.partyHeader,
      mobile: 'subtitle',
      render: (row) => <span className="text-fg-muted">{partyOf(row) ?? '—'}</span>,
    },
    {
      key: 'installment',
      header: 'Parcela',
      mobile: 'meta',
      render: (row) => (
        <span className="tabular-nums text-fg-muted">
          {installmentLabel(row.installment, row.installments)}
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Vencimento',
      mobile: 'meta',
      render: (row) => <span className="tabular-nums text-fg-muted">{formatDateBR(row.dueDate)}</span>,
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="font-semibold tabular-nums">{formatBRL(row.amountCents)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => (
        <Badge tone={ACCOUNT_STATUS_TONE[row.status]}>{ACCOUNT_STATUS_LABEL[row.status]}</Badge>
      ),
    },
    {
      key: 'settle',
      // Cabeçalho vazio no desktop (a última `<th>` do protótipo é vazia) e
      // sem rótulo no card mobile — mas com nome para leitor de tela.
      header: <span className="sr-only">Ação</span>,
      align: 'right',
      mobile: 'meta',
      render: (row) =>
        row.status === copy.settledStatus || row.status === 'CANCELED' ? null : (
          <Button
            size="sm"
            variant="outline"
            loading={settle.isPending && settle.variables === row.id}
            onClick={() => void onSettle(row.id)}
          >
            {copy.actionLabel}
          </Button>
        ),
    },
  ];

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <StatGridSkeleton count={3} min={200} />
        <Skeleton className="ml-auto h-10 w-36 rounded-control" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (query.isError) {
    return <BlockError label={copy.errorLabel} onRetry={() => void query.refetch()} />;
  }

  const summary: AccountSummary = query.data?.summary ?? {
    overdueCents: 0,
    next7DaysCents: 0,
    monthCents: 0,
  };
  const rows = (query.data?.data ?? []) as Row[];
  const meta = query.data?.meta;

  return (
    <div className="flex flex-col gap-4">
      <StatGrid min={200}>
        <FinanceStat label={copy.overdueLabel} value={formatBRL(summary.overdueCents)} tone="danger" />
        <FinanceStat label={copy.next7Label} value={formatBRL(summary.next7DaysCents)} tone="warning" />
        <FinanceStat label="Total do mês" value={formatBRL(summary.monthCents)} />
      </StatGrid>

      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Nova conta</Button>
      </div>

      <Panel>
        <ResponsiveTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          caption={copy.caption}
          empty={
            <EmptyState
              message={copy.emptyTitle}
              description={copy.emptyDescription}
              action={<Button onClick={() => setModalOpen(true)}>+ Nova conta</Button>}
            />
          }
        />
      </Panel>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-[13px] text-fg-muted">
            Página {meta.page} de {meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      )}

      <AccountModal
        open={modalOpen}
        kind={kind}
        bankAccounts={bankAccounts}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
