'use client';

import type { ReturnRate } from '@barbervp/types';

/**
 * "Taxa de retorno" (`Dashboard.dc.html` l.1381–1400).
 *
 * O protótipo crava `62%` e "dos clientes voltam em até 45 dias"; os dois vêm
 * da API — o percentual é a soma das três primeiras faixas, e o "45" é o corte
 * que o servidor usou (`withinDays`).
 */
export function ReturnRateCard({ returnRate }: { returnRate: ReturnRate }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <p className="font-display text-[30px] font-bold leading-none text-gold">
          {returnRate.headlinePct}%
        </p>
        <p className="mt-1 text-[13px] text-fg-muted">
          dos clientes voltam em até {returnRate.withinDays} dias
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {returnRate.buckets.map((bucket) => (
          <li key={bucket.label} className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-medium text-fg-muted">
              <span>{bucket.label}</span>
              <span className="tabular-nums">{bucket.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gold"
                // Proporcional à MAIOR faixa, como o protótipo (`maxRetPct`):
                // com base 100 as quatro barras ficariam todas curtas e a
                // comparação entre elas some.
                style={{ width: `${barWidth(bucket.pct, returnRate)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function barWidth(pct: number, returnRate: ReturnRate): number {
  const max = Math.max(...returnRate.buckets.map((bucket) => bucket.pct), 1);
  return Math.max(2, (pct / max) * 100);
}
