'use client';

import { WEEKDAY_LABELS, minutesToTime, type OnboardingBusinessHour } from '@barbervp/types';
import { Button, Select, Switch } from '@barbervp/ui';

export interface StepBusinessHoursProps {
  value: OnboardingBusinessHour[];
  onChange: (next: OnboardingBusinessHour[]) => void;
}

/** Grade de meia em meia hora, das 06:00 à meia-noite — a `TIMES` do protótipo. */
const TIME_OPTIONS = (() => {
  const options: Array<{ value: string; label: string }> = [];
  for (let hour = 6; hour <= 23; hour += 1) {
    for (const minutes of [0, 30]) {
      const value = String(hour * 60 + minutes);
      options.push({ value, label: minutesToTime(hour * 60 + minutes) });
    }
  }
  options.push({ value: String(24 * 60), label: '00:00' });
  return options;
})();

/**
 * Passo 6 — horário de funcionamento por dia da semana.
 *
 * A ordem é a do protótipo (segunda primeiro, domingo por último), embora o
 * dado guarde `weekday` no padrão `Date#getDay` (0 = domingo).
 */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function StepBusinessHours({ value, onChange }: StepBusinessHoursProps) {
  const byWeekday = new Map(value.map((hour) => [hour.weekday, hour]));

  const patch = (weekday: number, partial: Partial<OnboardingBusinessHour>) => {
    onChange(
      value.map((hour) => (hour.weekday === weekday ? { ...hour, ...partial } : hour)),
    );
  };

  /** "Aplicar estes horários para todos os dias abertos" — o atalho do protótipo. */
  const applyToAllOpen = () => {
    const reference = byWeekday.get(1) ?? value.find((hour) => !hour.closed);
    if (!reference) return;
    onChange(
      value.map((hour) =>
        hour.closed
          ? hour
          : { ...hour, opensAt: reference.opensAt, closesAt: reference.closesAt },
      ),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {DISPLAY_ORDER.map((weekday) => {
          const hour = byWeekday.get(weekday);
          if (!hour) return null;

          return (
            <li
              key={weekday}
              className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5"
            >
              <Switch
                checked={!hour.closed}
                onChange={(event) => patch(weekday, { closed: !event.target.checked })}
                aria-label={`${WEEKDAY_LABELS[weekday]} — aberto`}
              />
              <span className="w-24 shrink-0 text-sm font-semibold text-fg">
                {WEEKDAY_LABELS[weekday]}
              </span>
              <span className="flex-1" />

              {hour.closed ? (
                <span className="text-[13px] font-medium text-fg-subtle">Fechado</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Select
                    value={String(hour.opensAt)}
                    onChange={(event) =>
                      patch(weekday, { opensAt: Number(event.target.value) })
                    }
                    options={TIME_OPTIONS}
                    aria-label={`Abertura de ${WEEKDAY_LABELS[weekday]}`}
                    className="w-24 [&_select]:h-10"
                  />
                  <span className="text-[13px] text-fg-subtle">às</span>
                  <Select
                    value={String(hour.closesAt)}
                    onChange={(event) =>
                      patch(weekday, { closesAt: Number(event.target.value) })
                    }
                    options={TIME_OPTIONS}
                    aria-label={`Fechamento de ${WEEKDAY_LABELS[weekday]}`}
                    className="w-24 [&_select]:h-10"
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <Button variant="ghost" onClick={applyToAllOpen} className="self-start px-0 text-gold">
        ↧ Aplicar estes horários para todos os dias abertos
      </Button>

      {value.some((hour) => !hour.closed && hour.closesAt <= hour.opensAt) && (
        <p role="alert" className="text-xs text-danger">
          O fechamento precisa ser depois da abertura.
        </p>
      )}
    </div>
  );
}

/** O wizard usa isto para habilitar o botão do último passo. */
export function hasValidHours(hours: OnboardingBusinessHour[]): boolean {
  const open = hours.filter((hour) => !hour.closed);
  return open.length > 0 && open.every((hour) => hour.closesAt > hour.opensAt);
}
