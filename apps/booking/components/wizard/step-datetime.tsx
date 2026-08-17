'use client';

import {
  LAST_SLOTS_THRESHOLD,
  SLOT_PERIOD_LABEL,
  SlotPeriod,
  type AvailabilitySlot,
} from '@barbervp/types';
import { Button, DatePicker, EmptyState, TimeSlotGrid, type DayOption } from '@barbervp/ui';
import { MONTH_ABBR, WEEKDAY_ABBR, parseDateKey } from '../../lib/format';
import type { BookingWizardController } from './use-booking-wizard';

interface StepDateTimeProps {
  wizard: BookingWizardController;
}

const PERIOD_ORDER: SlotPeriod[] = [
  SlotPeriod.MORNING,
  SlotPeriod.AFTERNOON,
  SlotPeriod.EVENING,
];

/**
 * Passo 3 — data e horário.
 *
 * Reproduz a UX do protótipo com dado real: chips de dia com ponto de "sem
 * vagas", grade agrupada em Manhã/Tarde/Noite, aviso de escassez quando restam
 * até 3 horários e o atalho para o próximo dia livre quando o dia escolhido
 * está vazio.
 *
 * O que era simulação vira consulta: o `SLOT_PATTERNS` do protótipo (com os 500
 * ms de espera fingida) dá lugar ao motor de disponibilidade, e o esqueleto de
 * carregamento passa a cobrir uma busca de verdade.
 */
export function StepDateTime({ wizard }: StepDateTimeProps) {
  const { state, availability, availabilityLoading, selectDate, patch } = wizard;

  const days: DayOption[] = (availability?.days ?? []).map((day) => {
    const { month, day: dayOfMonth } = parseDateKey(day.date);
    return {
      value: day.date,
      weekday: WEEKDAY_ABBR[day.weekday] ?? '',
      day: dayOfMonth,
      caption: day.closed ? 'Fechado' : MONTH_ABBR[month - 1],
      disabled: day.closed,
      soldOut: day.soldOut,
    };
  });

  const slots = availability?.slots ?? [];
  const selectedTime =
    slots.find((slot) => slot.startsAt === state.startsAt)?.time ?? null;

  const groups = PERIOD_ORDER.map((period) => ({
    label: SLOT_PERIOD_LABEL[period],
    times: slots.filter((slot) => slot.period === period).map((slot) => slot.time),
  })).filter((group) => group.times.length > 0);

  const chooseTime = (time: string) => {
    const slot = slots.find((candidate: AvailabilitySlot) => candidate.time === time);
    if (slot) {
      patch({ startsAt: slot.startsAt });
    }
  };

  const isEmpty = !availabilityLoading && slots.length === 0;
  const scarce = slots.length > 0 && slots.length <= LAST_SLOTS_THRESHOLD;

  return (
    <div className="flex flex-col gap-5">
      <DatePicker
        days={days}
        value={state.date}
        onChange={selectDate}
        // Sem borda de foco cortada pelo overflow da faixa rolável.
        className="-mx-1 px-1"
      />

      {scarce && (
        <p className="text-[13px] text-warning">
          ⚡ {slots.length === 1 ? 'Último horário' : `Últimos ${slots.length} horários`} neste dia
        </p>
      )}

      {isEmpty ? (
        <EmptyState
          message="Sem horários neste dia"
          description={
            availability?.nextAvailableDate
              ? `Próximo livre: ${nextFreeLabel(availability.nextAvailableDate, availability.nextAvailableTime)}`
              : 'Tente outro dia na faixa acima.'
          }
          action={
            availability?.nextAvailableDate ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectDate(availability.nextAvailableDate!)}
              >
                Ir para este dia
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TimeSlotGrid
          groups={groups}
          value={selectedTime}
          onChange={chooseTime}
          loading={availabilityLoading}
        />
      )}
    </div>
  );
}

/** `2026-08-19` + `09:00` → `QUA 19 · 09:00`. */
function nextFreeLabel(dateKey: string, time: string | null): string {
  const { day } = parseDateKey(dateKey);
  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  const prefix = `${WEEKDAY_ABBR[weekday]} ${day}`;
  return time ? `${prefix} · ${time}` : prefix;
}
