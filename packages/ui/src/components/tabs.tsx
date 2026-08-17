'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Contador à direita do rótulo (os filtros de clientes do dashboard). */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `underline` = abas da `MinhaConta`; `segmented` = sub-abas em pílula. */
  variant?: 'underline' | 'segmented';
  /** Nome acessível da lista de abas. */
  label: string;
  /** Prefixo dos ids, para casar com `TabPanel`. */
  idPrefix?: string;
  className?: string;
}

/**
 * Abas roláveis horizontalmente no mobile — padrão de
 * Agendamentos/Assinatura/Meus dados da `MinhaConta.dc.html`.
 *
 * Abaixo de `sm` a lista rola no eixo X (sem estourar os 360px, regra 1) e as
 * abas mantêm a largura do conteúdo; a partir daí dividem o espaço em partes
 * iguais, como no protótipo. Navegação por ←/→/Home/End conforme o padrão
 * ARIA de tabs.
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'underline',
  label,
  idPrefix = 'bvp-tab',
  className,
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  const move = (delta: number) => {
    const enabled = items.filter((item) => !item.disabled);
    const currentIndex = enabled.findIndex((item) => item.value === value);
    const next = enabled[(currentIndex + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    listRef.current?.querySelector<HTMLButtonElement>(`#${idPrefix}-${next.value}`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      const first = items.find((item) => !item.disabled);
      if (first) onChange(first.value);
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = [...items].reverse().find((item) => !item.disabled);
      if (last) onChange(last.value);
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        'flex w-full min-w-0 overflow-x-auto',
        // Barra de rolagem escondida: no mobile as abas rolam por toque.
        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        variant === 'underline' && 'border-b border-border',
        variant === 'segmented' && 'gap-1 rounded-xl border border-border bg-surface-2 p-1',
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            id={`${idPrefix}-${item.value}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-sans transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              'disabled:cursor-not-allowed disabled:opacity-40',
              // Divide o espaço só quando cabe; no mobile mantém e rola.
              'sm:flex-1 sm:shrink',

              variant === 'underline' && [
                'h-12 border-b-2 px-4 text-sm',
                selected
                  ? 'border-gold font-semibold text-fg'
                  : 'border-transparent font-medium text-fg-muted hover:text-fg',
              ],
              variant === 'segmented' && [
                'h-9 rounded-lg px-3.5 text-[13px] font-semibold',
                selected ? 'bg-gold text-bg' : 'text-fg-muted hover:text-fg',
              ],
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span className={cn('tabular-nums', selected ? 'opacity-80' : 'text-fg-subtle')}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  value: string;
  /** Aba ativa — se não bater com `value`, o painel não renderiza. */
  active: string;
  idPrefix?: string;
  className?: string;
  children: ReactNode;
}

/** Painel ligado por `aria-controls`/`aria-labelledby` à aba correspondente. */
export function TabPanel({ value, active, idPrefix = 'bvp-tab', className, children }: TabPanelProps) {
  if (value !== active) return null;
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-${value}`}
      tabIndex={0}
      className={cn('focus-visible:outline-none', className)}
    >
      {children}
    </div>
  );
}
