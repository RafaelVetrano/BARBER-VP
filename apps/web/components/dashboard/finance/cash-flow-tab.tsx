'use client';

import { Fragment, useState } from 'react';
import { EmptyState, Skeleton, cn } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { CashFlowCategoryTotal } from '@barbervp/types';
import { useCashFlowQuery } from '@/lib/dashboard/api/finance';
import { CashFlowChart } from './cash-flow-chart';
import { BlockError } from '../blocks';
import { formatSigned } from './finance-shared';

const MONTHS = 6;

/**
 * Sub-aba **Fluxo de caixa** (`Dashboard.dc.html` l.1014–1088).
 *
 * Gráfico + tabela por mês, cada linha abrindo o detalhe por categoria. Aqui a
 * tabela NÃO usa o `ResponsiveTable`: a linha expansível não cabe no contrato
 * dele (uma `<tr>` a mais por linha, com `colspan`), e no mobile o desenho
 * certo é o card já expandido, não um card com kebab.
 */
export function CashFlowTab() {
  const query = useCashFlowQuery(MONTHS);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (query.isError) {
    return <BlockError label="o fluxo de caixa" onRetry={() => void query.refetch()} />;
  }

  const months = query.data?.months ?? [];
  const hasMovement = months.some((month) => month.inCents > 0 || month.outCents > 0);

  if (!hasMovement) {
    return (
      <EmptyState
        message="Ainda não há movimento para somar"
        description="Assim que a primeira comanda for fechada, o mês aparece aqui com entradas, saídas e saldo."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-border bg-surface p-5">
        <CashFlowChart months={months} />
      </section>

      <section className="overflow-hidden rounded-xl md:border md:border-border md:bg-surface">
        {/* ── ≥ md: tabela com linha expansível ────────────────────────── */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Fluxo de caixa mensal — entradas, saídas, saldo do mês e saldo acumulado
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-fg-muted">
                  Mês
                </th>
                {['Entradas', 'Saídas', 'Saldo do mês', 'Saldo acumulado'].map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2.5 text-right text-[12px] font-semibold uppercase tracking-wide text-fg-muted"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((month) => {
                const open = expanded === month.month;
                return (
                  <Fragment key={month.month}>
                    <tr className="border-b border-border hover:bg-surface-2">
                      <td className="px-3 py-2.5 text-[13px] font-medium text-fg">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setExpanded(open ? null : month.month)}
                          className="flex items-center gap-2 rounded-sm text-left transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        >
                          <span aria-hidden="true" className="text-fg-muted">
                            {open ? '▾' : '▸'}
                          </span>
                          {month.label}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-success">
                        {formatBRL(month.inCents)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-danger">
                        {formatBRL(month.outCents)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums',
                          month.balanceCents >= 0 ? 'text-success' : 'text-danger',
                        )}
                      >
                        {formatSigned(month.balanceCents)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums text-fg">
                        {formatBRL(month.accumulatedCents)}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border bg-surface-2">
                        <td colSpan={5} className="px-6 py-3.5">
                          <div className="grid grid-cols-2 gap-6">
                            <CategoryList title="Entradas por categoria" items={month.inflowByCategory} />
                            <CategoryList title="Saídas por categoria" items={month.outflowByCategory} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── < md: um card por mês, já com o detalhe aberto ───────────── */}
        <ul className="flex flex-col gap-3 md:hidden">
          {months.map((month) => (
            <li key={month.month} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">{month.label}</h3>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    month.balanceCents >= 0 ? 'text-success' : 'text-danger',
                  )}
                >
                  {formatSigned(month.balanceCents)}
                </span>
              </div>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-[13px]">
                <div className="flex gap-1.5">
                  <dt className="text-fg-muted">Entradas</dt>
                  <dd className="tabular-nums text-success">{formatBRL(month.inCents)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-fg-muted">Saídas</dt>
                  <dd className="tabular-nums text-danger">{formatBRL(month.outCents)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-fg-muted">Acumulado</dt>
                  <dd className="font-semibold tabular-nums text-fg">
                    {formatBRL(month.accumulatedCents)}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 grid gap-4 border-t border-border pt-3">
                <CategoryList title="Entradas por categoria" items={month.inflowByCategory} />
                <CategoryList title="Saídas por categoria" items={month.outflowByCategory} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CategoryList({ title, items }: { title: string; items: CashFlowCategoryTotal[] }) {
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{title}</h4>
      {items.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nada neste mês.</p>
      ) : (
        <dl className="flex flex-col">
          {items.map((item) => (
            <div key={item.name} className="flex justify-between gap-3 py-1 text-[13px]">
              <dt className="text-fg-muted">{item.name}</dt>
              <dd className="tabular-nums text-fg">{formatBRL(item.amountCents)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
