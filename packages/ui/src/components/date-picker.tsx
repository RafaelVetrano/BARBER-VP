'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';

export interface DayOption {
  /** Identificador do dia (ISO `YYYY-MM-DD` na fase 04). */
  value: string;
  /** Abreviação do dia da semana ("SEG"). Formatado por quem chama. */
  weekday: string;
  /** Número do dia no mês. */
  day: number;
  /** Linha de baixo — mês abreviado ou "Fechado". */
  caption?: string;
  /** Barbearia fechada: chip apagado e não selecionável. */
  disabled?: boolean;
  /** Aberto, porém sem horário livre: ponto vermelho no canto. */
  soldOut?: boolean;
}

export interface DayPillProps {
  option: DayOption;
  selected: boolean;
  onSelect: () => void;
  /** Só o chip selecionado entra na ordem de tabulação (padrão ARIA radio). */
  tabIndex?: number;
}

/**
 * Chip de dia — 56×72 com dia da semana, número e legenda, portado da faixa de
 * datas do `AgendamentoWizard.dc.html`. O ponto vermelho no canto marca
 * "sem vagas"; o texto `aria-label` diz o mesmo, porque cor não é informação.
 */
export function DayPill({ option, selected, onSelect, tabIndex }: DayPillProps) {
  const state = option.disabled ? 'fechado' : option.soldOut ? 'sem vagas' : 'com vagas';

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${option.weekday} ${option.day}${option.caption ? ` de ${option.caption}` : ''} — ${state}`}
      disabled={option.disabled}
      tabIndex={tabIndex}
      onClick={onSelect}
      className={cn(
        'relative flex h-[72px] w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-default disabled:opacity-40',
        selected
          ? 'border-gold bg-gold'
          : 'border-border bg-surface-3 hover:border-border-strong',
      )}
    >
      <span
        className={cn(
          'text-[11px] font-semibold uppercase',
          selected ? 'text-bg' : 'text-fg-muted',
        )}
      >
        {option.weekday}
      </span>
      <span className={cn('text-lg font-bold tabular-nums', selected ? 'text-bg' : 'text-fg')}>
        {option.day}
      </span>
      {option.caption && (
        <span className={cn('text-[11px]', selected ? 'text-bg' : 'text-fg-muted')}>
          {option.caption}
        </span>
      )}
      {option.soldOut && !option.disabled && (
        <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-danger" />
      )}
    </button>
  );
}

export interface DatePickerProps {
  days: DayOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Nome acessível da faixa de dias. */
  label?: string;
  className?: string;
}

/**
 * Faixa horizontal de dias. Rola no toque abaixo de `sm` e navega com ←/→,
 * pulando os dias em que a barbearia está fechada.
 */
export function DatePicker({ days, value, onChange, label = 'Escolha o dia', className }: DatePickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  const move = (delta: number) => {
    const enabled = days.filter((day) => !day.disabled);
    const current = enabled.findIndex((day) => day.value === value);
    const next = enabled[(current + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    const index = days.findIndex((day) => day.value === next.value);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        }
      }}
      className={cn(
        'flex w-full min-w-0 gap-2 overflow-x-auto px-0.5 py-1',
        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {days.map((option) => {
        const selected = option.value === value;
        return (
          <DayPill
            key={option.value}
            option={option}
            selected={selected}
            onSelect={() => onChange(option.value)}
            tabIndex={selected || (!value && !option.disabled && option === days[0]) ? 0 : -1}
          />
        );
      })}
    </div>
  );
}
