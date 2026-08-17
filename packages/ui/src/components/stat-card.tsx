import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Card } from './card';

export interface StatCardProps {
  label: ReactNode;
  /** Número grande já formatado (moeda em centavos vira string na camada de dados). */
  value: ReactNode;
  /** Variação em relação ao período anterior. */
  delta?: { label: ReactNode; direction: 'up' | 'down' | 'flat' };
  /** Linha de detalhe abaixo do número ("18 confirmados · 3 pendentes"). */
  hint?: ReactNode;
  /**
   * Série para o mini-gráfico. Cada valor vira um ponto; a escala é
   * normalizada pelo mínimo e máximo da própria série.
   */
  sparkline?: number[];
  className?: string;
}

const ARROW = { up: '▲', down: '▼', flat: '—' } as const;

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      // 3..25 deixa margem para a espessura do traço não ser cortada.
      const y = 25 - ((point - min) / range) * 22;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width="100%"
      height="28"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className="text-gold"
    >
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/**
 * Cartão de indicador — os KPIs do topo do `Dashboard.dc.html` (rótulo mudo,
 * número grande em Sora com `tabular-nums`, variação e mini-gráfico dourado),
 * reaproveitados também na landing de vendas.
 */
export function StatCard({ label, value, delta, hint, sparkline, className }: StatCardProps) {
  return (
    <Card className={cn('gap-2', className)}>
      <span className="text-[13px] font-medium text-fg-muted">{label}</span>
      <span className="font-display text-[26px] font-bold leading-none tabular-nums text-fg">
        {value}
      </span>

      {delta && (
        <span
          className={cn(
            'text-xs font-semibold',
            delta.direction === 'up' && 'text-success',
            delta.direction === 'down' && 'text-danger',
            delta.direction === 'flat' && 'text-fg-muted',
          )}
        >
          <span aria-hidden="true">{ARROW[delta.direction]} </span>
          {delta.label}
        </span>
      )}

      {hint && <span className="text-xs leading-relaxed text-fg-muted">{hint}</span>}
      {sparkline && <Sparkline points={sparkline} />}
    </Card>
  );
}
