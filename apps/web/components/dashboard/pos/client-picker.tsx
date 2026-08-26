'use client';

import { useEffect, useState } from 'react';
import { Avatar, EmptyState, Input, SearchIcon, Skeleton, cn } from '@barbervp/ui';
import { formatPhone } from '@barbervp/types';
import { useClientsQuery } from '@/lib/dashboard/api/clients';

/** Janela do debounce — a busca é do servidor, igual à da aba Clientes. */
const SEARCH_DEBOUNCE_MS = 350;
const RESULTS_PER_PAGE = 20;

export interface ClientPickerProps {
  onPick: (client: { id: string; name: string }) => void;
  /** Compacto = a versão de dentro do cabeçalho ("trocar"), l.3172. */
  compact?: boolean;
  autoFocus?: boolean;
}

/**
 * Busca de cliente do modal de comanda (`comandaClientQuery`, l.3176).
 *
 * O MESMO bloco serve os dois lugares em que o protótipo o usa: o passo 1 de
 * "Nova comanda" e o "trocar" do cabeçalho — muda só a densidade.
 *
 * Diferente do protótipo, a lista já vem preenchida antes de digitar (os 20
 * clientes mais recentes): o balconista quase sempre quer alguém que acabou de
 * chegar, e uma lista vazia esperando digitação é um passo a mais na fila.
 */
export function ClientPicker({ onPick, compact = false, autoFocus = false }: ClientPickerProps) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const query = useClientsQuery({ search, perPage: RESULTS_PER_PAGE });
  const rows = query.data?.data ?? [];

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Input
        aria-label="Buscar cliente"
        placeholder="Buscar por nome…"
        addonLeft={<SearchIcon size={15} />}
        autoFocus={autoFocus}
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />

      <div className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'max-h-56' : 'max-h-80')}>
        {query.isLoading ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : query.isError ? (
          <EmptyState
            message="Não foi possível carregar os clientes."
            action={
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="text-[13px] font-semibold text-gold underline-offset-4 hover:underline"
              >
                Tentar de novo
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState message="Nenhum cliente encontrado." />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {rows.map((row) => (
              <li key={row.clientId}>
                <button
                  type="button"
                  onClick={() => onPick({ id: row.clientId, name: row.name })}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-surface-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                    compact ? 'min-h-11 px-2 py-1.5' : 'min-h-11 px-2 py-2',
                  )}
                >
                  <Avatar name={row.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{row.name}</span>
                    {!compact && (
                      <span className="block text-xs text-fg-muted">{formatPhone(row.phone)}</span>
                    )}
                  </span>
                  <span aria-hidden className="shrink-0 text-fg-subtle">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
