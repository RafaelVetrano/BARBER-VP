'use client';

import { cn } from '../lib/cn';
import { Skeleton, SkeletonGroup } from './skeleton';

export interface TimeChipProps {
  /** Horário já formatado ("09:30"). */
  time: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Chip de horário — 44px de altura, raio 10, contorno `--line` que vira
 * dourado preenchido quando escolhido (grade de horários do
 * `AgendamentoWizard.dc.html`).
 */
export function TimeChip({ time, selected, onSelect, disabled, className }: TimeChipProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'h-11 rounded-control border text-sm tabular-nums transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-40',
        selected
          ? 'border-gold bg-gold font-semibold text-bg'
          : 'border-border bg-transparent text-fg hover:border-border-strong',
        className,
      )}
    >
      {time}
    </button>
  );
}

export interface TimeSlotGroup {
  /** Faixa do dia: "MANHÃ", "TARDE", "NOITE". */
  label: string;
  times: string[];
}

export interface TimeSlotGridProps {
  groups: TimeSlotGroup[];
  value: string | null;
  onChange: (time: string) => void;
  /** Mostra o esqueleto de carregamento no lugar da grade. */
  loading?: boolean;
  label?: string;
  className?: string;
}

/**
 * Grade de horários agrupada por período — 4 colunas, como no wizard.
 *
 * Enquanto `loading`, entra o esqueleto de duas faixas (também portado do
 * protótipo, que simula a busca de slots por 500ms).
 */
export function TimeSlotGrid({
  groups,
  value,
  onChange,
  loading = false,
  label = 'Escolha o horário',
  className,
}: TimeSlotGridProps) {
  if (loading) {
    return (
      <SkeletonGroup label="Carregando horários" className={cn('flex flex-col gap-4', className)}>
        {[0, 1].map((block) => (
          <div key={block}>
            <Skeleton variant="text" className="mb-2.5 w-16" />
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((slot) => (
                <Skeleton key={slot} />
              ))}
            </div>
          </div>
        ))}
      </SkeletonGroup>
    );
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-col gap-4', className)}>
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2.5 text-[13px] font-semibold text-fg-muted">{group.label}</p>
          {group.times.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {group.times.map((time) => (
                <TimeChip
                  key={time}
                  time={time}
                  selected={time === value}
                  onSelect={() => onChange(time)}
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-fg-muted">Sem horários nesta faixa</p>
          )}
        </div>
      ))}
    </div>
  );
}
