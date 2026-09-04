'use client';

import { useState } from 'react';
import {
  Button,
  EmptyState,
  Input,
  ResponsiveTable,
  Skeleton,
  cn,
  useToast,
  type TableColumn,
} from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { CashMovementItem } from '@barbervp/types';
import { useCashRegisterQuery, useOpenCashMutation } from '@/lib/dashboard/api/finance';
import { BlockError, FinanceStat, Panel, StatGrid, StatGridSkeleton } from '../blocks';
import { CashMovementModal } from './cash-movement-modal';
import { CloseCashModal } from './close-cash-modal';
import { financeErrorMessage, formatSigned, formatTime, inputToCents, methodLabel } from './finance-shared';

/**
 * Sub-aba **Caixa** (`Dashboard.dc.html` l.736–814).
 *
 * Dois estados, como no protótipo: o card central de abertura quando não há
 * caixa aberto, e — quando há — os 4 KPIs, a barra de ações e o extrato do dia.
 * O toggle "Demonstração: caixa aberto/fechado" do protótipo NÃO foi portado:
 * era o interruptor que fingia os dois estados sem backend. Aqui o estado é o
 * que `GET /finance/cash-register` responde.
 */
export function CashTab({ timezone }: { timezone: string }) {
  const { toast } = useToast();
  const statusQuery = useCashRegisterQuery();
  const openCash = useOpenCashMutation();

  const [openingInput, setOpeningInput] = useState('');
  const [movementDirection, setMovementDirection] = useState<'IN' | 'OUT' | null>(null);
  const [closing, setClosing] = useState(false);

  async function submitOpen() {
    try {
      await openCash.mutateAsync({ openingCents: inputToCents(openingInput) });
      toast({ message: 'Caixa aberto.', tone: 'success' });
      setOpeningInput('');
    } catch (error) {
      toast({ message: financeErrorMessage(error, 'Não foi possível abrir o caixa.'), tone: 'danger' });
    }
  }

  if (statusQuery.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <StatGridSkeleton count={4} />
        <Skeleton className="h-10 w-full max-w-md rounded-control" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (statusQuery.isError) {
    return <BlockError label="o caixa" onRetry={() => void statusQuery.refetch()} />;
  }

  const register = statusQuery.data?.register;

  // ── Caixa fechado: card central de abertura (l.737) ────────────────────
  if (!statusQuery.data?.open || !register) {
    return (
      <div className="flex items-center justify-center py-10 md:py-14">
        <div className="flex w-full max-w-[380px] flex-col items-center gap-[18px] rounded-2xl border border-border bg-surface p-7 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-border bg-surface-2">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16v12H4zM4 7l2-4h12l2 4M9 11a3 3 0 0 0 6 0"
                stroke="currentColor"
                className="text-fg-muted"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <div>
            <h2 className="font-display text-[17px] font-bold text-fg">Caixa fechado</h2>
            <p className="mt-1 text-[13px] text-fg-muted">
              Informe o saldo inicial para abrir o caixa do dia.
            </p>
          </div>

          <div className="w-full text-left">
            <Input
              label="Saldo inicial (troco)"
              placeholder="0,00"
              inputMode="decimal"
              addonLeft={<span className="text-sm font-medium text-fg-muted">R$</span>}
              value={openingInput}
              onChange={(event) => setOpeningInput(event.target.value)}
            />
          </div>

          <Button fullWidth loading={openCash.isPending} onClick={() => void submitOpen()}>
            Abrir caixa
          </Button>
        </div>
      </div>
    );
  }

  // ── Caixa aberto (l.759) ───────────────────────────────────────────────
  const movements = register.movements;
  const columns: TableColumn<CashMovementItem>[] = [
    {
      key: 'time',
      header: 'Hora',
      mobile: 'meta',
      render: (row) => (
        <span className="tabular-nums text-fg-muted">{formatTime(row.createdAt, timezone)}</span>
      ),
    },
    { key: 'desc', header: 'Descrição', mobile: 'title', render: (row) => row.description ?? '—' },
    {
      key: 'category',
      header: 'Categoria',
      mobile: 'subtitle',
      render: (row) => <span className="text-fg-muted">{row.category ?? '—'}</span>,
    },
    {
      key: 'method',
      header: 'Forma de pagamento',
      mobile: 'meta',
      render: (row) => <span className="text-fg-muted">{row.method ? methodLabel(row.method) : '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      mobile: 'meta',
      render: (row) => (
        <span
          className={cn(
            'font-semibold tabular-nums',
            row.amountCents > 0 ? 'text-success' : row.amountCents < 0 ? 'text-danger' : 'text-fg-muted',
          )}
        >
          {row.amountCents === 0 ? '—' : formatSigned(row.amountCents)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <StatGrid>
        <FinanceStat label="Saldo inicial" value={formatBRL(register.openingCents)} />
        <FinanceStat label="Entradas" value={formatBRL(register.entriesCents)} tone="success" />
        <FinanceStat label="Saídas" value={formatBRL(register.exitsCents)} tone="danger" />
        <FinanceStat label="Saldo atual" value={formatBRL(register.currentCents)} tone="gold" />
      </StatGrid>

      <div className="flex flex-wrap gap-2.5">
        <Button variant="outline" onClick={() => setMovementDirection('IN')}>
          + Entrada avulsa
        </Button>
        <Button variant="outline" onClick={() => setMovementDirection('OUT')}>
          + Saída/Sangria
        </Button>
        <Button className="sm:ml-auto" onClick={() => setClosing(true)}>
          Fechar caixa
        </Button>
      </div>

      <Panel title="Movimentações de hoje">
        <ResponsiveTable
          columns={columns}
          rows={movements}
          getRowKey={(row) => row.id}
          caption="Movimentações do caixa aberto"
          empty={
            <EmptyState
              message="Nenhuma movimentação ainda"
              description="As comandas fechadas e os lançamentos manuais aparecem aqui."
            />
          }
        />
      </Panel>

      <CashMovementModal
        open={movementDirection !== null}
        direction={movementDirection ?? 'IN'}
        onClose={() => setMovementDirection(null)}
      />
      <CloseCashModal open={closing} register={register} onClose={() => setClosing(false)} />
    </div>
  );
}
