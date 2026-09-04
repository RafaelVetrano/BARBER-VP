'use client';

import type { AiChatMetricPoint } from '@barbervp/types';

/**
 * A linha do cartão de métrica (protótipo l.2849): `polyline` sem eixo, sem
 * grade e sem preenchimento — só a inclinação.
 *
 * `preserveAspectRatio="none"` é o que deixa a linha esticar com o cartão,
 * como no original; a espessura fica em `vector-effect` para não engordar
 * junto com o esticão.
 */
export function Sparkline({ series }: { series: AiChatMetricPoint[] }) {
  if (series.length < 2) return null;

  const values = series.map((point) => point.valueCents);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // Série constante (inclusive toda zerada) desenharia divisão por zero: o
  // fallback é a linha no meio da caixa, que é a leitura honesta de "sem
  // variação" — não uma linha colada no topo.
  const span = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 24 - ((value - min) / span) * 20;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      width="100%"
      height="26"
      viewBox="0 0 100 26"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        className="stroke-gold"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
