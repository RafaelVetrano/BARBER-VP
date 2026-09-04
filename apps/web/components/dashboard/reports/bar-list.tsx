'use client';

import { formatBRL } from '@barbervp/types';

export interface BarListRow {
  id: string;
  name: string;
  valueCents: number;
}

/**
 * As barras de "Faturamento por barbeiro" e "por serviço"
 * (`Dashboard.dc.html` l.1314–1334): nome à esquerda, valor tabular à direita,
 * trilho `#12151A` de 10px e o preenchimento dourado proporcional ao MAIOR da
 * lista — não ao total, que achataria todas as barras.
 */
export function BarList({ rows }: { rows: BarListRow[] }) {
  const max = Math.max(...rows.map((row) => row.valueCents), 1);

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-[13px] font-medium">
            <span className="min-w-0 truncate text-fg">{row.name}</span>
            <span className="shrink-0 tabular-nums text-fg-muted">{formatBRL(row.valueCents)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-[5px] bg-surface-2">
            <div
              className="h-full rounded-[5px] bg-gold"
              style={{ width: `${Math.max(2, (row.valueCents / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
