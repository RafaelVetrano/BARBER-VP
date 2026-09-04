'use client';

import { Fragment, type ReactNode } from 'react';
import { ChevronDownIcon } from '../icons';
import { cn } from '../lib/cn';
import { Card } from './card';
import { Menu, type MenuItem } from './menu';
import { Checkbox } from './toggle';

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

/**
 * Seleção em massa — a coluna de caixas do protótipo mais a barra de ações que
 * ela acende. Fica no componente compartilhado, e não em cada página, porque a
 * caixa precisa existir TAMBÉM no card mobile: uma seleção que só funciona no
 * desktop é uma ação que some no celular.
 */
export interface TableSelection<Row> {
  /** Chaves marcadas — mesmo espaço de `getRowKey`. */
  selectedKeys: string[];
  onToggleRow: (key: string, row: Row) => void;
  /** Marca/desmarca todas as linhas visíveis. */
  onToggleAll: () => void;
  /** Rótulo acessível da caixa da linha (ex.: "Selecionar João"). */
  getRowLabel?: (row: Row) => string;
  /** Rótulo acessível da caixa do cabeçalho. */
  allLabel?: string;
}

/**
 * Linha que abre um bloco de detalhe logo abaixo — o extrato por barbeiro da
 * aba Comissões (`Dashboard.dc.html` l.1170).
 *
 * O gatilho é um `<button aria-expanded>` numa coluna própria à esquerda, e
 * não a `<tr>` inteira clicável do protótipo: uma linha com um botão "PDF"
 * dentro não pode ser toda ela um alvo de clique, senão baixar o relatório
 * também abriria o extrato.
 */
export interface TableExpansion<Row> {
  isExpanded: (row: Row) => boolean;
  onToggle: (row: Row) => void;
  /** Conteúdo revelado — ocupa a largura toda da tabela. */
  render: (row: Row) => ReactNode;
  /** Rótulo acessível do gatilho (ex.: "Ver extrato de João"). */
  getLabel?: (row: Row) => string;
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
  /** Coluna de caixas de seleção — omitir deixa a tabela como sempre foi. */
  selection?: TableSelection<Row>;
  /** Detalhe expansível por linha — omitir deixa a tabela como sempre foi. */
  expansion?: TableExpansion<Row>;
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
  selection,
  expansion,
  empty,
  className,
}: ResponsiveTableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const titleColumn = columns.find((column) => column.mobile === 'title') ?? columns[0];
  const subtitleColumns = columns.filter((column) => column.mobile === 'subtitle');
  const metaColumns = columns.filter((column) => column.mobile === 'meta');
  const actionsLabel = (row: Row) => getActionsLabel?.(row) ?? 'Ações da linha';

  const selectedSet = new Set(selection?.selectedKeys ?? []);
  const isSelected = (row: Row) => selectedSet.has(getRowKey(row));
  const allSelected = rows.length > 0 && rows.every(isSelected);
  const rowSelectionLabel = (row: Row) => selection?.getRowLabel?.(row) ?? 'Selecionar linha';
  const expansionLabel = (row: Row) => expansion?.getLabel?.(row) ?? 'Ver detalhes da linha';
  // `colSpan` da célula de detalhe: as colunas declaradas mais as que a tabela
  // acrescenta sozinha (seleção, gatilho, kebab).
  const totalColumns =
    columns.length + (selection ? 1 : 0) + (expansion ? 1 : 0) + (actions ? 1 : 0);

  const ExpandTrigger = ({ row, className: triggerClass }: { row: Row; className?: string }) =>
    expansion ? (
      <button
        type="button"
        onClick={() => expansion.onToggle(row)}
        aria-expanded={expansion.isExpanded(row)}
        aria-label={expansionLabel(row)}
        className={cn(
          'flex items-center justify-center rounded-lg text-fg-muted transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
          triggerClass,
        )}
      >
        <ChevronDownIcon
          size={16}
          className={cn('transition-transform', expansion.isExpanded(row) && 'rotate-180')}
        />
      </button>
    ) : null;

  return (
    <div className={cn('w-full min-w-0', className)}>
      {/*
        ── ≥ md: tabela ───────────────────────────────────────────────

        `relative` não é decoração: `caption`/`span` com `sr-only` são
        `position:absolute`, e sem um ancestral posicionado o bloco que os
        contém passa a ser a página inteira — eles escapam do recorte deste
        contêiner e esticam o `scrollWidth` do documento. O resultado é a
        página inteira rolando na horizontal enquanto a tabela, que deveria
        rolar por dentro, fica parada.
      */}
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border">
              {expansion && (
                <th scope="col" className="w-9 px-2 py-2.5">
                  <span className="sr-only">Abrir detalhes</span>
                </th>
              )}
              {selection && (
                <th scope="col" className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={allSelected}
                    onChange={selection.onToggleAll}
                    aria-label={selection.allLabel ?? 'Selecionar todos'}
                  />
                </th>
              )}
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
              <Fragment key={getRowKey(row)}>
              <tr
                className={cn(
                  'border-b border-border last:border-0 hover:bg-surface-2',
                  isSelected(row) && 'bg-gold/[0.06]',
                  expansion?.isExpanded(row) && 'bg-surface-2',
                )}
              >
                {expansion && (
                  <td className="px-2 py-2.5">
                    <ExpandTrigger row={row} className="size-6" />
                  </td>
                )}
                {selection && (
                  <td className="px-3 py-2.5">
                    <Checkbox
                      checked={isSelected(row)}
                      onChange={() => selection.onToggleRow(getRowKey(row), row)}
                      aria-label={rowSelectionLabel(row)}
                    />
                  </td>
                )}
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
              {expansion?.isExpanded(row) && (
                <tr className="border-b border-border last:border-0 bg-bg">
                  <td colSpan={totalColumns} className="px-4 py-4">
                    {expansion.render(row)}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── < md: um card por linha ──────────────────────────────────── */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={getRowKey(row)}>
            <Card className={cn('gap-2', isSelected(row) && 'border-gold/40 bg-gold/[0.06]')}>
              <div className="flex items-start justify-between gap-3">
                {selection && (
                  // A caixa tem 24px; no card (que só existe no dedo) o alvo
                  // precisa dos 44px das WCAG — daí o `label` de 44 em volta,
                  // que alarga a área de toque sem inchar o desenho.
                  <label
                    htmlFor={`bvp-select-${getRowKey(row)}`}
                    className="-m-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center p-2.5"
                  >
                    <Checkbox
                      id={`bvp-select-${getRowKey(row)}`}
                      checked={isSelected(row)}
                      onChange={() => selection.onToggleRow(getRowKey(row), row)}
                      aria-label={rowSelectionLabel(row)}
                    />
                  </label>
                )}
                <div className="min-w-0 flex-1">
                  {titleColumn && (
                    <div className="text-sm font-semibold text-fg">
                      {onRowClick ? (
                        <button
                          type="button"
                          onClick={() => onRowClick(row)}
                          // O card só existe abaixo de `md`, ou seja, sempre
                          // no dedo: o título precisa do alvo inteiro, não da
                          // altura da linha de texto.
                          className="flex min-h-11 w-full items-center rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
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
                <div className="flex shrink-0 items-center gap-1">
                  {/* 44px porque o card só existe no dedo. */}
                  <ExpandTrigger row={row} className="size-11" />
                  {actions && <Menu items={actions(row)} label={actionsLabel(row)} />}
                </div>
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

              {expansion?.isExpanded(row) && (
                <div className="border-t border-border pt-3">{expansion.render(row)}</div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
