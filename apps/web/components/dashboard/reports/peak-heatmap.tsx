'use client';

import type { ReportsHeatmap } from '@barbervp/types';

/**
 * "Heatmap de horários de pico" (`Dashboard.dc.html` l.1404–1420): grade de
 * `48px + 14 colunas`, célula de 26px, dourado com opacidade proporcional à
 * célula mais cheia.
 *
 * A intensidade tem um piso de 0.06 como no protótipo — célula totalmente
 * transparente sumiria contra o card e a grade perderia a forma. Zero
 * atendimento continua distinguível: o `title` diz o número.
 */
export function PeakHeatmap({ heatmap }: { heatmap: ReportsHeatmap }) {
  const template = `48px repeat(${heatmap.hours.length}, minmax(0, 1fr))`;

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="min-w-[760px]">
        <div className="mb-1 grid gap-1" style={{ gridTemplateColumns: template }}>
          <span />
          {heatmap.hours.map((hour) => (
            <span key={hour} className="text-center text-[10px] font-medium text-fg-muted">
              {hour}h
            </span>
          ))}
        </div>

        {heatmap.rows.map((row) => (
          <div key={row.weekday} className="mb-1 grid gap-1" style={{ gridTemplateColumns: template }}>
            <span className="flex items-center text-xs font-medium text-fg-muted">{row.day}</span>
            {row.cells.map((cell) => (
              <span
                key={cell.hour}
                title={`${row.day}, ${cell.hour}h — ${cell.appointments} atendimento(s)`}
                className="h-[26px] rounded-[5px]"
                style={{ background: `rgba(212,168,76,${Math.max(0.06, cell.intensity).toFixed(2)})` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
