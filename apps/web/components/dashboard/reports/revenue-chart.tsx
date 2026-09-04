'use client';

import { useState } from 'react';
import { formatBRL } from '@barbervp/types';
import type { ReportRevenuePoint } from '@barbervp/types';
import { thinLabels } from './reports-shared';

const W = 680;
const H = 200;
const BASE = 6;
const HEADROOM = 1.15;

/**
 * "Faturamento por período" (`Dashboard.dc.html` l.1288–1310): coluna de
 * rótulos do eixo Y à esquerda, área com gradiente dourado, rótulos do eixo X
 * embaixo.
 *
 * O eixo Y é uma COLUNA FLEX de 200px com `justify-between`, não texto dentro
 * do SVG: o SVG estica com `preserveAspectRatio="none"` e qualquer `<text>`
 * dentro dele sairia esticado junto.
 */
export function RevenueChart({ points }: { points: ReportRevenuePoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const max = Math.max(...points.map((point) => point.revenueCents), 1) * HEADROOM;
  const stepX = points.length > 1 ? W / (points.length - 1) : W;
  const yOf = (value: number) => H - (value / max) * (H - BASE) - BASE;

  const coords = points.map((point, index) => ({
    x: points.length > 1 ? index * stepX : W / 2,
    y: yOf(point.revenueCents),
  }));
  const line = coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
    .join(' ');

  const yLabels = [1, 0.75, 0.5, 0.25, 0].map((ratio) => formatBRL(Math.round(max * ratio)));
  // Oito rótulos como o protótipo; a 360px eles somam mais que a largura útil
  // do card, então o celular recebe quatro. Duas linhas, uma escondida por
  // breakpoint — medir a largura no cliente causaria salto na primeira pintura.
  const xLabels = thinLabels(points, 8);
  const xLabelsCompact = thinLabels(points, 4);
  const active = hovered === null ? null : points[hovered];
  const activeCoord = hovered === null ? null : coords[hovered];

  return (
    <div className="flex gap-2">
      <div className="flex h-[200px] shrink-0 flex-col justify-between">
        {yLabels.map((label) => (
          <span key={label} className="whitespace-nowrap text-right text-[11px] font-medium text-fg-muted">
            {label}
          </span>
        ))}
      </div>

      <div className="relative min-w-0 flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Faturamento por período: ${points.length} pontos, máximo de ${formatBRL(Math.max(...points.map((point) => point.revenueCents), 0))}.`}
          className="block"
        >
          <defs>
            <linearGradient id="bvp-rev-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4A84C" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#D4A84C" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#bvp-rev-grad)" />
          <path
            d={line}
            fill="none"
            stroke="#D4A84C"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {activeCoord && <circle cx={activeCoord.x} cy={activeCoord.y} r="4" fill="#D4A84C" />}
        </svg>

        {/* Faixas invisíveis, uma por ponto — o tooltip do protótipo. */}
        <div className="absolute inset-0" onMouseLeave={() => setHovered(null)}>
          {coords.map((coord, index) => (
            <span
              // Pontos posicionais não reordenam.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              aria-hidden="true"
              onMouseEnter={() => setHovered(index)}
              onTouchStart={() => setHovered(index)}
              className="absolute top-0 h-full -translate-x-1/2 cursor-crosshair"
              style={{ left: `${(coord.x / W) * 100}%`, width: `${100 / points.length}%` }}
            />
          ))}
        </div>

        {active && activeCoord && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-lg border border-border bg-surface-3 px-2.5 py-1.5 shadow-menu"
            style={{ left: `${(activeCoord.x / W) * 100}%`, top: activeCoord.y }}
          >
            <p className="text-[11px] text-fg-muted">{active.label}</p>
            <p className="text-[13px] font-semibold text-fg">{formatBRL(active.revenueCents)}</p>
          </div>
        )}

        <div className="mt-1.5 hidden justify-between sm:flex">
          {xLabels.map((entry) => (
            <span
              key={`${entry.item.label}-${entry.index}`}
              className="whitespace-nowrap text-[11px] font-medium text-fg-muted"
            >
              {entry.item.label}
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between sm:hidden">
          {xLabelsCompact.map((entry) => (
            <span
              key={`${entry.item.label}-${entry.index}`}
              className="whitespace-nowrap text-[11px] font-medium text-fg-muted"
            >
              {entry.item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
