'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeSearchText } from '@barbervp/types';
import { CheckIcon, ChevronDownIcon, SearchIcon } from '../icons';
import { cn } from '../lib/cn';
import { useEscapeKey, useIsMounted, useScrollLock } from '../lib/use-overlay';
import { Field, controlClasses, describedBy, useFieldIds, type FieldOwnProps } from './field';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Texto extra que também casa na busca (a sigla da UF, por exemplo). */
  keywords?: string;
}

export interface ComboboxProps extends FieldOwnProps {
  options: ComboboxOption[];
  /** Valor selecionado, ou `null`. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Texto do gatilho quando nada está selecionado. */
  placeholder?: string;
  /** Texto do campo de busca dentro do painel. */
  searchPlaceholder?: string;
  /** Mensagem quando a busca não acha nada. */
  emptyMessage?: string;
  /** Rótulo acessível quando não há `label` visível. */
  'aria-label'?: string;
  id?: string;
  name?: string;
}

/**
 * Seletor com busca — nasceu no agente 30, para Cidade e UF do passo 2 do
 * onboarding.
 *
 * **Por que um primitive novo, e não o `Select`.** O `Select` é o `<select>`
 * nativo, de propósito (abre a roda do sistema no celular). Ele resolve
 * dezenas de opções; não resolve 5.570 municípios, onde a única navegação
 * viável é digitar. Nasce aqui porque a aba Configurações e a Minha Página
 * também têm endereço e vão querer o mesmo controle.
 *
 * Convenções dos overlays da fase 02, herdadas inteiras: painel em portal
 * (para não ser recortado por `overflow-hidden` de card ou diálogo), trava de
 * scroll enquanto aberto, ESC fecha e devolve o foco ao gatilho, clique fora
 * fecha. Abaixo de 768px o painel é bottom-sheet de largura total, como o
 * `Popover` — um dropdown ancorado de 320px não cabe numa tela de 360.
 *
 * Teclado: ↑/↓ movem o item ativo, Enter escolhe, Esc fecha; `aria-activedescendant`
 * anuncia o item ativo sem tirar o foco do campo de busca.
 */
export function Combobox({
  options,
  value,
  onChange,
  label,
  required,
  hint,
  error,
  className,
  id,
  name,
  placeholder = 'Selecione',
  searchPlaceholder = 'Buscar…',
  emptyMessage = 'Nada encontrado.',
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const ids = useFieldIds(id);
  const listId = `${ids.id}-list`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const mounted = useIsMounted();

  const selected = options.find((option) => option.value === value) ?? null;

  const filtered = useMemo(() => {
    const needle = normalizeSearchText(query);
    if (!needle) return options;
    return options.filter((option) =>
      normalizeSearchText(`${option.label} ${option.keywords ?? ''}`).includes(needle),
    );
  }, [options, query]);

  useScrollLock(open);
  useEscapeKey(open, () => close());

  // Abrir zera a busca e posiciona o item ativo no que já está escolhido — a
  // lista de 5.570 municípios abre mostrando o município atual, não o primeiro
  // em ordem alfabética.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const index = options.findIndex((option) => option.value === value);
    setActiveIndex(index >= 0 ? index : 0);
    searchRef.current?.focus();
  }, [open, options, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Mantém o item ativo visível na rolagem — sem isto, navegar por teclado numa
  // lista longa move um destaque que ninguém vê.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, filtered.length]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function choose(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + delta + filtered.length) % filtered.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) choose(option);
    }
  }

  const panel = (
    <>
      {/* Fecha ao clicar fora, em qualquer lugar — e escurece no mobile, onde o
          painel é sheet e o fundo precisa recuar. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={close}
        className="fixed inset-0 z-[60] cursor-default bg-black/60 md:bg-black/30"
      />

      <div
        role="dialog"
        aria-label={typeof label === 'string' ? label : (ariaLabel ?? placeholder)}
        className={cn(
          'z-[61] flex flex-col overflow-hidden border border-border bg-surface-3 shadow-menu',
          'fixed inset-x-0 bottom-0 max-h-[80dvh] animate-bvp-up rounded-t-3xl',
          'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[60dvh] md:w-[380px]',
          'md:-translate-x-1/2 md:-translate-y-1/2 md:animate-bvp-fade md:rounded-xl',
        )}
      >
        <div className="shrink-0 border-b border-border p-3">
          <div className="relative flex items-center">
            <SearchIcon size={16} className="pointer-events-none absolute left-3 text-fg-subtle" />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                filtered[activeIndex] ? `${listId}-${filtered[activeIndex]!.value}` : undefined
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              className={cn(controlClasses({}), 'h-12 pl-9')}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-fg-muted">{emptyMessage}</p>
        ) : (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={typeof label === 'string' ? label : (ariaLabel ?? placeholder)}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:pb-1.5"
          >
            {filtered.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <li key={option.value} role="none">
                  <button
                    type="button"
                    id={`${listId}-${option.value}`}
                    role="option"
                    aria-selected={isSelected}
                    data-active={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                    className={cn(
                      // 44px de alvo no dedo, como todo item tocável do produto.
                      'flex min-h-11 w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2.5',
                      'text-left text-[13px] font-medium transition-colors',
                      isSelected ? 'text-gold' : 'text-fg',
                      isActive && (isSelected ? 'bg-gold/10' : 'bg-surface-2'),
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {isSelected && <CheckIcon size={15} className="shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <Field label={label} required={required} hint={hint} error={error} ids={ids} className={className}>
      <button
        ref={triggerRef}
        type="button"
        id={ids.id}
        name={name}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, error, hint)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          controlClasses({ error: !!error }),
          'flex h-12 items-center justify-between gap-2 text-left',
          !selected && 'text-fg-subtle',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDownIcon size={16} className="shrink-0 text-fg-muted" />
      </button>

      {open && mounted && createPortal(panel, document.body)}
    </Field>
  );
}
