'use client';

import { formatBRL } from '@barbervp/types';
import type { CashFlowMonth } from '@barbervp/types';

const WIDTH = 780;
const HEIGHT = 220;
const BASELINE = HEIGHT - 30;
const PLOT_TOP = 16;

/**
 * Entradas × saídas por mês, com a linha do saldo acumulado por cima
 * (`Dashboard.dc.html` l.1024). SVG puro, como o resto do design system.
 *
 * As barras e a linha usam ESCALAS DIFERENTES de propósito: o acumulado é um
 * estoque (pode ser dez vezes o fluxo do mês) e o fluxo é uma vazão. Na mesma
 * escala, uma das duas séries vira uma reta colada no eixo — é o que o
 * protótipo faz, e o eixo secundário é o que torna a leitura possível.
 */
export function CashFlowChart({ months }: { months: CashFlowMonth[] }) {
  if (months.length === 0) return null;

  const groupWidth = WIDTH / months.length;
  const barWidth = groupWidth * 0.26;
  // `* 1.15` deixa ar acima da barra mais alta, como no protótipo.
  const maxBar = Math.max(...months.map((month) => Math.max(month.inCents, month.outCents)), 1) * 1.15;
  const barHeight = (cents: number) => (cents / maxBar) * (HEIGHT - 40);

  const series = months.map((month) => month.accumulatedCents);
  const accMin = Math.min(...series, 0);
  const accMax = Math.max(...series, 1);
  const accRange = accMax - accMin || 1;
  const points = series.map((value, index) => ({
    x: index * groupWidth + groupWidth / 2,
    y: BASELINE - ((value - accMin) / accRange) * (BASELINE - PLOT_TOP),
  }));
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-4">
        <h3 className="text-sm font-semibold text-fg">Entradas × Saídas (últimos {months.length} meses)</h3>
        <ul className="flex flex-wrap gap-3.5 sm:ml-auto">
          <Legend className="rounded-sm bg-success">Entradas</Legend>
          <Legend className="rounded-sm bg-danger">Saídas</Legend>
          <Legend className="rounded-full bg-gold">Saldo acumulado</Legend>
        </ul>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          height={HEIGHT}
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label={`Fluxo de caixa dos últimos ${months.length} meses: entradas, saídas e saldo acumulado.`}
          className="min-w-[560px]"
        >
          {months.map((month, index) => {
            const center = index * groupWidth + groupWidth / 2;
            const inHeight = barHeight(month.inCents);
            const outHeight = barHeight(month.outCents);
            return (
              <g key={month.month}>
                <rect
                  x={center - barWidth - 2}
                  y={BASELINE - inHeight}
                  width={barWidth}
                  height={inHeight}
                  rx={3}
                  className="fill-success"
                />
                <rect
                  x={center + 2}
                  y={BASELINE - outHeight}
                  width={barWidth}
                  height={outHeight}
                  rx={3}
                  className="fill-danger"
                />
                <text
                  x={center}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  fontSize="11"
                  className="fill-fg-muted"
                >
                  {month.label}
                </text>
              </g>
            );
          })}

          <path d={linePath} strokeWidth={2} fill="none" className="stroke-gold" />
          {points.map((point, index) => (
            <circle key={months[index]!.month} cx={point.x} cy={point.y} r={3.5} className="fill-gold" />
          ))}
        </svg>
      </div>

      {/* A tabela abaixo do gráfico já traz os números; aqui só o total da janela. */}
      <p className="text-xs text-fg-muted">
        Saldo acumulado no período: {formatBRL(series[series.length - 1] ?? 0)}
      </p>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: string }) {
  return (
    <li className="flex items-center gap-1.5 text-xs text-fg-muted">
      <span aria-hidden="true" className={`inline-block size-2.5 ${className}`} />
      {children}
    </li>
  );
}
