'use client';

import type { TenantBusinessHour } from '@barbervp/types';
import {
  WEEKDAY_LABELS,
  WEEKDAY_SHORT_LABELS,
  WEEK_ORDER_MONDAY_FIRST,
  minutesToTime,
  timeToMinutes,
} from '@barbervp/types';
import { Switch } from '@barbervp/ui';

/** Onde o almoço nasce quando o dono liga o toggle, se o dia ainda não tem um. */
const DEFAULT_LUNCH = { start: 12 * 60, end: 13 * 60 };

export interface BusinessHoursEditorProps {
  hours: TenantBusinessHour[];
  onChange: (weekday: number, patch: Partial<TenantBusinessHour>) => void;
}

/**
 * "Horário de funcionamento" (`Dashboard.dc.html` l.2504–2534).
 *
 * Uma linha por dia, na ordem da semana do produto (segunda → domingo): dia,
 * interruptor de aberto/fechado, entrada–saída e o toggle "Almoço" com as duas
 * horas do intervalo DA CASA. Dia desligado mostra "Fechado" e some com os
 * campos, como no desenho.
 *
 * O `<input type="time">` é nativo de propósito: no celular abre a roda do
 * sistema, e é o mesmo controle que o protótipo usa.
 */
export function BusinessHoursEditor({ hours, onChange }: BusinessHoursEditorProps) {
  const byWeekday = new Map(hours.map((hour) => [hour.weekday, hour]));

  return (
    <div className="flex flex-col gap-2">
      {WEEK_ORDER_MONDAY_FIRST.map((weekday) => {
        const hour = byWeekday.get(weekday);
        if (!hour) return null;

        const hasLunch = hour.lunchStart !== null && hour.lunchEnd !== null;
        const dayName = WEEKDAY_LABELS[weekday];

        return (
          <div
            key={weekday}
            className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-surface-2 p-2"
          >
            <span className="w-9 shrink-0 text-xs font-semibold text-fg">
              {WEEKDAY_SHORT_LABELS[weekday]}
            </span>

            <Switch
              aria-label={`${dayName}: aberto`}
              checked={!hour.closed}
              onChange={(event) => onChange(weekday, { closed: !event.target.checked })}
            />

            {hour.closed ? (
              <span className="text-xs font-medium text-fg-muted">Fechado</span>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TimeField
                    label={`${dayName}: abre às`}
                    value={hour.opensAt}
                    onChange={(minutes) => onChange(weekday, { opensAt: minutes })}
                  />
                  <span className="text-xs text-fg-subtle">–</span>
                  <TimeField
                    label={`${dayName}: fecha às`}
                    value={hour.closesAt}
                    onChange={(minutes) => onChange(weekday, { closesAt: minutes })}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ml-1.5 text-[11px] text-fg-muted">Almoço</span>
                  <Switch
                    aria-label={`${dayName}: fecha para o almoço`}
                    checked={hasLunch}
                    onChange={(event) =>
                      onChange(
                        weekday,
                        event.target.checked
                          ? {
                              lunchStart: Math.max(hour.opensAt, DEFAULT_LUNCH.start),
                              lunchEnd: Math.min(hour.closesAt, DEFAULT_LUNCH.end),
                            }
                          : { lunchStart: null, lunchEnd: null },
                      )
                    }
                  />
                  {hasLunch && (
                    <>
                      <TimeField
                        label={`${dayName}: almoço começa às`}
                        value={hour.lunchStart as number}
                        onChange={(minutes) => onChange(weekday, { lunchStart: minutes })}
                      />
                      <span className="text-xs text-fg-subtle">–</span>
                      <TimeField
                        label={`${dayName}: almoço termina às`}
                        value={hour.lunchEnd as number}
                        onChange={(minutes) => onChange(weekday, { lunchEnd: minutes })}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <input
      type="time"
      aria-label={label}
      value={minutesToTime(value)}
      onChange={(event) => {
        const minutes = timeToMinutes(event.target.value);
        if (minutes !== null) onChange(minutes);
      }}
      // 44px de altura no toque, 32 a partir de `sm` — é a régua da regra 6.
      className="h-11 rounded-control border border-border bg-surface px-2 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-gold sm:h-8"
    />
  );
}
