'use client';

import { formatBRL } from '@barbervp/types';
import type { CashFlowMonth } from '@barbervp/types';

/**
 * Fluxo de caixa mensal — barras entrada/saída em SVG puro (sem lib de
 * gráfico, mesma convenção do resto do design system). Responsivo: a
 * legenda fica ao lado no desktop e some para uma linha abaixo no mobile
 * (regra 1 — "gráficos responsivos com legenda abaixo no mobile").
 */
export function CashFlowChart({ months }: { months: CashFlowMonth[] }) {
  if (months.length === 0) return null;

  const max = Math.max(...months.map((m) => Math.max(m.inCents, m.outCents)), 1);
  const height = 160;
  const barWidth = 14;
  const groupWidth = 56;

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${months.length * groupWidth} ${height + 24}`}
          width="100%"
          height={height + 24}
          role="img"
          aria-label="Fluxo de caixa mensal — entradas e saídas"
          preserveAspectRatio="xMinYMin meet"
        >
          {months.map((month, index) => {
            const x = index * groupWidth + (groupWidth - barWidth * 2 - 4) / 2;
            const inH = (month.inCents / max) * height;
            const outH = (month.outCents / max) * height;
            return (
              <g key={month.month}>
                <rect x={x} y={height - inH} width={barWidth} height={inH} rx={3} fill="#3FB68B" />
                <rect x={x + barWidth + 4} y={height - outH} width={barWidth} height={outH} rx={3} fill="#E05B5B" />
                <text x={x + barWidth + 2} y={height + 16} textAnchor="middle" fontSize="10" fill="#9AA1AC">
                  {month.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-success" /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-danger" /> Saídas
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {months.map((month) => (
          <div key={month.month} className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs">
            <p className="font-semibold text-fg">{month.label}</p>
            <p className="text-fg-muted">
              {formatBRL(month.inCents)} · <span className={month.balanceCents >= 0 ? 'text-success' : 'text-danger'}>{formatBRL(month.balanceCents)}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
