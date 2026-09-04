'use client';

import type { ReactNode } from 'react';
import { Button, EmptyState, Skeleton, cn } from '@barbervp/ui';

/**
 * Blocos repetidos pelas abas de números do painel — as 6 sub-abas do
 * Financeiro (fase 18) e a de Comissões (fase 19).
 *
 * O KPI daqui é MAIS SIMPLES que o `StatCard` do design system de propósito:
 * o protótipo (l.760, l.837, l.895, l.1108) não tem variação, dica nem
 * sparkline — só rótulo mudo e número grande, às vezes colorido. Reaproveitar
 * o `StatCard` traria três adornos que a tela não pede.
 */

export type StatTone = 'default' | 'success' | 'danger' | 'warning' | 'gold';

const STAT_TONE: Record<StatTone, string> = {
  default: 'text-fg',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  gold: 'text-gold',
};

export function FinanceStat({
  label,
  value,
  tone = 'default',
  children,
}: {
  label: string;
  /** Número já formatado. Omitir quando o card mostra `children` (um selo). */
  value?: string;
  tone?: StatTone;
  /** Conteúdo no lugar do número — o card "Status" da aba Comissões é um selo. */
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      {children ? (
        <div className="mt-2">{children}</div>
      ) : (
        <p className={cn('mt-1.5 font-display text-[22px] font-bold tabular-nums', STAT_TONE[tone])}>
          {value}
        </p>
      )}
    </div>
  );
}

/** Grid `auto-fit` dos KPIs — `minmax(180px,1fr)` no Caixa, 200px nas contas. */
export function StatGrid({ children, min = 180 }: { children: ReactNode; min?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fit,minmax(min(${min}px,100%),1fr))` }}
    >
      {children}
    </div>
  );
}

/** Painel com moldura — a caixa `#181B21` que embrulha as tabelas do protótipo. */
export function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl md:border md:border-border md:bg-surface', className)}>
      {title && (
        <h3 className="hidden px-4 py-3.5 text-sm font-semibold text-fg md:block md:border-b md:border-border">
          {title}
        </h3>
      )}
      <div className="md:p-1">{children}</div>
    </section>
  );
}

/**
 * Falha de UM bloco: a sub-aba continua de pé e as demais seguem servindo.
 * Nunca derruba a página inteira (regra 4 do enunciado).
 */
export function BlockError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <EmptyState
      message={`Não foi possível carregar ${label}.`}
      action={
        <Button variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      }
    />
  );
}

/** Esqueleto na MESMA altura do bloco final — carregar não pode mexer no layout. */
export function StatGridSkeleton({ count, min = 180 }: { count: number; min?: number }) {
  return (
    <StatGrid min={min}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-[86px] rounded-xl" />
      ))}
    </StatGrid>
  );
}
