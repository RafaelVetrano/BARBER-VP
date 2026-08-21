'use client';

import { useId, useMemo, useState } from 'react';
import { cn } from '../lib/cn';

export interface AreaChartPoint {
  label: string;
  value: number;
}

export interface AreaChartProps {
  points: AreaChartPoint[];
  /** Linha tracejada de meta, na MESMA unidade dos pontos. `null` = sem meta. */
  goal?: number | null;
  /** Texto colado na linha de meta (ex.: "Meta: R$ 28.000/mês"). */
  goalLabel?: string;
  /** Formata o valor no tooltip. */
  formatValue: (value: number) => string;
  /** Descrição do gráfico para leitor de tela. */
  label: string;
  className?: string;
}

// Geometria do protótipo: viewBox 600×220, folga de 15% acima do pico e 6px de
// respiro embaixo para a espessura do traço não ser cortada.
const W = 600;
const H = 220;
const PAD = 20;
const BASE = 6;
const HEADROOM = 1.15;

/**
 * Área com gradiente do card "Faturamento — últimos 30 dias"
 * (`Dashboard.dc.html`).
 *
 * A altura é FIXA em 220px e só a largura estica (`preserveAspectRatio=none`),
 * porque a linha de meta é posicionada em pixels sobre o SVG: com escala
 * vertical variável, o rótulo descolaria da linha.
 */
export function AreaChart({ points, goal, goalLabel, formatValue, label, className }: AreaChartProps) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length < 2) {
      return null;
    }

    const max = Math.max(...points.map((point) => point.value), goal ?? 0) * HEADROOM || 1;
    const stepX = W / (points.length - 1);
    const yOf = (value: number) => H - (value / max) * (H - PAD) - BASE;

    const coords = points.map((point, index) => ({ x: index * stepX, y: yOf(point.value) }));
    const line = coords
      .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
      .join(' ');

    return {
      coords,
      linePath: line,
      areaPath: `${line} L${W},${H} L0,${H} Z`,
      goalY: goal === null || goal === undefined ? null : yOf(goal),
    };
  }, [points, goal]);

  if (!geometry) {
    return null;
  }

  const active = hovered === null ? null : points[hovered];
  const activeCoord = hovered === null ? null : geometry.coords[hovered];

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="block"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4A84C" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#D4A84C" stopOpacity="0" />
          </linearGradient>
        </defs>

        {geometry.goalY !== null && (
          <line
            x1="0"
            y1={geometry.goalY}
            x2={W}
            y2={geometry.goalY}
            stroke="#9AA1AC"
            strokeWidth="1.5"
            strokeDasharray="5 5"
          />
        )}

        <path d={geometry.areaPath} fill={`url(#${gradientId})`} />
        <path d={geometry.linePath} fill="none" stroke="#D4A84C" strokeWidth="2.5" />

        {activeCoord && (
          <circle cx={activeCoord.x} cy={activeCoord.y} r="4" fill="#D4A84C" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {geometry.goalY !== null && goalLabel && (
        <span
          className="pointer-events-none absolute right-0 -translate-y-full bg-surface-2 px-1 text-[11px] font-medium text-fg-muted"
          style={{ top: geometry.goalY }}
        >
          {goalLabel}
        </span>
      )}

      {/* Zonas invisíveis do protótipo: uma faixa por ponto, centrada nele. */}
      <div className="absolute inset-0" onMouseLeave={() => setHovered(null)}>
        {geometry.coords.map((coord, index) => (
          <span
            // Os pontos são posicionais e não reordenam.
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
          <p className="text-[13px] font-semibold text-fg">{formatValue(active.value)}</p>
        </div>
      )}
    </div>
  );
}
