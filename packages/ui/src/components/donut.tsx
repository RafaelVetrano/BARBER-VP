import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface DonutSlice {
  /** Fração do total, 0–100. */
  pct: number;
  /** Cor da fatia — token do tema, já resolvido pelo chamador. */
  color: string;
  label: string;
}

export interface DonutProps {
  slices: DonutSlice[];
  /** Diâmetro externo em px (56 no KPI de ocupação, 150 no card de serviços). */
  size: number;
  /** Espessura do anel em px. O miolo é `size - 2 * thickness`. */
  thickness: number;
  /** Conteúdo do miolo — o "78%" da ocupação, o total do mês nos serviços. */
  children?: ReactNode;
  /** Descrição para leitor de tela; sem ela o gráfico é puro ornamento. */
  label?: string;
  className?: string;
}

/**
 * Rosca em `conic-gradient`, igual ao protótipo (`Dashboard.dc.html`, cards de
 * Ocupação e de Serviços mais vendidos): um círculo com o gradiente cônico e
 * outro menor por cima, na cor do card, abrindo o furo.
 *
 * Sem fatia nenhuma o anel fica todo na cor da borda — é o estado vazio, e não
 * um gráfico "zerado" que insinuaria dado.
 */
export function Donut({ slices, size, thickness, children, label, className }: DonutProps) {
  const positive = slices.filter((slice) => slice.pct > 0);

  let cursor = 0;
  const stops = positive.map((slice) => {
    const from = cursor;
    cursor = Math.min(100, cursor + slice.pct);
    return `${slice.color} ${from}% ${cursor}%`;
  });
  // O resto do anel fica na cor da linha — o "vazio" do protótipo (#2A2F38).
  stops.push(`var(--bvp-donut-rest) ${cursor}% 100%`);

  const inner = size - thickness * 2;

  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('relative shrink-0 rounded-full', className)}
      style={{
        width: size,
        height: size,
        ['--bvp-donut-rest' as string]: '#2A2F38',
        backgroundImage: `conic-gradient(${stops.join(', ')})`,
      }}
    >
      <span
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-surface-2 text-center"
        style={{ width: inner, height: inner }}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * Paleta das fatias, na ORDEM do protótipo — dourado, azul, verde, âmbar e o
 * cinza que é sempre "Outros".
 */
export const DONUT_PALETTE = ['#D4A84C', '#5B8DE0', '#3FB68B', '#E8A13C', '#5B616B'] as const;

/** A cor da fatia `index`; a última da paleta é reservada ao "Outros". */
export function donutColor(index: number, isRest = false): string {
  if (isRest) return DONUT_PALETTE[DONUT_PALETTE.length - 1] as string;
  return DONUT_PALETTE[index % (DONUT_PALETTE.length - 1)] as string;
}
