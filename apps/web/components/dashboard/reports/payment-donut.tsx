'use client';

import { Donut } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { PaymentDistributionEntry } from '@barbervp/types';
import { PAYMENT_COLORS, methodLabel } from './reports-shared';

/**
 * "Faturamento por forma de pagamento" (`Dashboard.dc.html` l.1355–1377):
 * rosca de 128px com anel de 18px e a legenda ao lado, com o percentual
 * encostado à direita.
 *
 * O percentual vem do SERVIDOR (`entry.pct`), não de uma divisão feita aqui: é
 * o mesmo número que sai no CSV e no PDF, e recalcular no cliente é como as
 * duas versões passam a discordar por arredondamento.
 */
export function PaymentDonut({ entries }: { entries: PaymentDistributionEntry[] }) {
  const slices = entries.map((entry, index) => ({
    pct: entry.pct,
    color: PAYMENT_COLORS[index % PAYMENT_COLORS.length] as string,
    label: methodLabel(entry.method),
  }));

  return (
    <div className="flex flex-wrap items-center gap-5">
      <Donut
        slices={slices}
        size={128}
        thickness={18}
        label={`Faturamento por forma de pagamento: ${slices.map((slice) => `${slice.label} ${slice.pct}%`).join(', ')}.`}
      />
      <ul className="flex min-w-[150px] flex-1 flex-col gap-2">
        {entries.map((entry, index) => (
          <li key={entry.method} className="flex items-center gap-2 text-[13px] font-medium">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: PAYMENT_COLORS[index % PAYMENT_COLORS.length] }}
            />
            <span className="min-w-0 truncate text-fg">{methodLabel(entry.method)}</span>
            <span className="ml-auto shrink-0 tabular-nums text-fg-muted" title={formatBRL(entry.amountCents)}>
              {entry.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
