'use client';

import { cn } from '../lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nome acessível do grupo (ex.: "Recorte do gráfico"). */
  label: string;
  className?: string;
}

/**
 * Alternador Dia/Semana/Mês do card de faturamento (`Dashboard.dc.html`):
 * trilho `#12151A` com borda, item ativo em dourado sólido com texto escuro.
 *
 * `role="radiogroup"` e não abas: o conteúdo abaixo não troca de painel, muda
 * de recorte — e é um valor único entre opções exclusivas.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex shrink-0 gap-1 rounded-[9px] border border-border bg-surface p-[3px]', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              // O trilho do protótipo tem 28px de altura, que é abaixo do
              // mínimo de toque das WCAG: até `md` cada opção vira um alvo de
              // 44px, e a partir daí volta à altura compacta do desenho.
              'h-11 min-w-11 rounded-[7px] px-4 text-xs font-semibold transition-colors md:h-7 md:min-w-0 md:px-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
              active ? 'bg-gold text-bg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
