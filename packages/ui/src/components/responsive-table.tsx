'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Card } from './card';
import { Menu, type MenuItem } from './menu';

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: 'left' | 'right';
  /**
   * Papel da coluna no card mobile. Só `title`, `subtitle` e `meta` aparecem
   * abaixo de `md` — as demais somem, por isso escolha as 2–3 que importam.
   */
  mobile?: 'title' | 'subtitle' | 'meta';
}

export interface ResponsiveTableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  /** Descrição da tabela para leitores de tela (vira `<caption>` invisível). */
  caption: string;
  /** Ações por linha — kebab na tabela e no card. */
  actions?: (row: Row) => MenuItem[];
  /** Rótulo acessível do kebab daquela linha. */
  getActionsLabel?: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  /** O que mostrar quando `rows` está vazio (use o `EmptyState`). */
  empty?: ReactNode;
  className?: string;
}

/**
 * Tabela que vira lista de cards no mobile.
 *
 * A partir de `md` é uma `<table>` de verdade (com `<caption>` para leitor de
 * tela); abaixo disso, um card por linha com as colunas marcadas como
 * `title`/`subtitle`/`meta` e as ações no kebab — regra 1: as tabelas
 * desktop-fixas do protótipo não podem simplesmente rolar no celular.
 */
export function ResponsiveTable<Row>({
  columns,
  rows,
  getRowKey,
  caption,
  actions,
  getActionsLabel,
  onRowClick,
  empty,
  className,
}: ResponsiveTableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const titleColumn = columns.find((column) => column.mobile === 'title') ?? columns[0];
  const subtitleColumns = columns.filter((column) => column.mobile === 'subtitle');
  const metaColumns = columns.filter((column) => column.mobile === 'meta');
  const actionsLabel = (row: Row) => getActionsLabel?.(row) ?? 'Ações da linha';

  return (
    <div className={cn('w-full min-w-0', className)}>
      {/* ── ≥ md: tabela ─────────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-fg-muted',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.header}
                </th>
              ))}
              {actions && (
                <th scope="col" className="w-12 px-3 py-2.5">
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="border-b border-border last:border-0 hover:bg-surface-2">
                {columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-2.5 text-[13px] text-fg',
                      column.align === 'right' && 'text-right tabular-nums',
                    )}
                  >
                    {index === 0 && onRowClick ? (
                      <button
                        type="button"
                        onClick={() => onRowClick(row)}
                        className="rounded-sm text-left transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                      >
                        {column.render(row)}
                      </button>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
                {actions && (
                  <td className="px-3 py-2.5">
                    <Menu items={actions(row)} label={actionsLabel(row)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── < md: um card por linha ──────────────────────────────────── */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={getRowKey(row)}>
            <Card className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {titleColumn && (
                    <div className="text-sm font-semibold text-fg">
                      {onRowClick ? (
                        <button
                          type="button"
                          onClick={() => onRowClick(row)}
                          className="rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                        >
                          {titleColumn.render(row)}
                        </button>
                      ) : (
                        titleColumn.render(row)
                      )}
                    </div>
                  )}
                  {subtitleColumns.map((column) => (
                    <div key={column.key} className="mt-0.5 text-[13px] text-fg-muted">
                      {column.render(row)}
                    </div>
                  ))}
                </div>
                {actions && <Menu items={actions(row)} label={actionsLabel(row)} />}
              </div>

              {metaColumns.length > 0 && (
                <dl className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-2">
                  {metaColumns.map((column) => (
                    <div key={column.key} className="flex items-center gap-1.5">
                      <dt className="text-[11px] uppercase tracking-wide text-fg-muted">
                        {column.header}
                      </dt>
                      <dd className="text-[13px] tabular-nums text-fg">{column.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
