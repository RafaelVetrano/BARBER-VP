'use client';

import type { NoShowTrend } from '@barbervp/types';

const W = 560;
const H = 160;
const BASE = 6;
const HEADROOM = 1.15;

/**
 * "Taxa de faltas por mês" (`Dashboard.dc.html` l.1424–1447).
 *
 * A linha tracejada com o balão "WhatsApp de lembrete ativado" só aparece
 * quando a barbearia REALMENTE ligou o lembrete
 * (`WhatsappAutomationConfig.enabledAt`) e isso caiu dentro dos 8 meses. Sem
 * essa data, o gráfico vem sem o balão — anunciar uma ativação que não houve
 * daria ao dono um mérito que a fila de mensagens não sustenta.
 */
export function NoShowChart({ trend }: { trend: NoShowTrend }) {
  const points = trend.points;
  const max = Math.max(...points.map((point) => point.pct), 1) * HEADROOM;
  const stepX = points.length > 1 ? W / (points.length - 1) : W;
  const yOf = (value: number) => H - (value / max) * (H - BASE) - BASE;

  const line = points
    .map((point, index) => {
      const x = points.length > 1 ? index * stepX : W / 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${yOf(point.pct).toFixed(1)}`;
    })
    .join(' ');

  const markerIndex = trend.whatsappActivatedIndex;
  const markerX = markerIndex === null ? null : markerIndex * stepX;
  const markerPct = markerX === null ? null : (markerX / W) * 100;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Taxa de faltas por mês: ${points.map((point) => `${point.label} ${point.pct}%`).join(', ')}.`}
          className="block"
        >
          {markerX !== null && (
            <line
              x1={markerX}
              y1="0"
              x2={markerX}
              y2={H}
              stroke="#2A2F38"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          )}
          <path
            d={line}
            fill="none"
            stroke="#D4A84C"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {markerPct !== null && (
          <span
            className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-[7px] border border-border bg-surface-3 px-2 py-1 text-[11px] font-semibold text-gold"
            style={{ left: `${clamp(markerPct)}%` }}
          >
            WhatsApp de lembrete ativado
          </span>
        )}
      </div>

      <div className="flex justify-between">
        {points.map((point) => (
          <span key={point.month} className="text-[11px] font-medium text-fg-muted">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** O balão é largo; colado nas pontas ele sairia do card. */
function clamp(pct: number): number {
  return Math.min(82, Math.max(18, pct));
}
