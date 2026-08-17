'use client';

import { useEffect, useState } from 'react';
import { Button, Switch, useToast } from '@barbervp/ui';
import { WEEKDAY_LABELS, minutesToTime, timeToMinutes } from '@barbervp/types';
import type { WorkScheduleDay } from '@barbervp/types';
import { useUpdateWorkScheduleMutation } from '../../lib/api/team';

/** Escala semanal de um barbeiro — grid de 7 dias com intervalo de almoço. */
export function WorkScheduleEditor({ barberId, schedule }: { barberId: string; schedule: WorkScheduleDay[] }) {
  const { toast } = useToast();
  const update = useUpdateWorkScheduleMutation();
  const [days, setDays] = useState<WorkScheduleDay[]>(schedule);
  const [openedFor, setOpenedFor] = useState(barberId);

  useEffect(() => {
    if (openedFor !== barberId) {
      setOpenedFor(barberId);
      setDays(schedule);
    }
  }, [barberId, schedule, openedFor]);

  const patchDay = (weekday: number, patch: Partial<WorkScheduleDay>) => {
    setDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
  };

  const save = async () => {
    try {
      const result = await update.mutateAsync({ barberId, dto: { days } });
      setDays(result);
      toast({ message: 'Escala atualizada.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar a escala.', tone: 'danger' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {days.map((day) => (
        <div
          key={day.weekday}
          className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface-2 p-3 sm:flex-row sm:items-center"
        >
          <span className="w-24 shrink-0 text-sm font-semibold text-fg">{WEEKDAY_LABELS[day.weekday]}</span>

          <Switch
            label="Trabalha"
            checked={!day.isDayOff}
            onChange={(event) => patchDay(day.weekday, { isDayOff: !event.target.checked })}
            className="shrink-0 sm:w-32"
          />

          {!day.isDayOff && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <input
                aria-label={`Início ${WEEKDAY_LABELS[day.weekday]}`}
                type="time"
                value={minutesToTime(day.startTime)}
                onChange={(event) => {
                  const minutes = timeToMinutes(event.target.value);
                  if (minutes !== null) patchDay(day.weekday, { startTime: minutes });
                }}
                className="h-9 rounded-lg border border-border bg-surface-3 px-2 text-fg"
              />
              <span>até</span>
              <input
                aria-label={`Fim ${WEEKDAY_LABELS[day.weekday]}`}
                type="time"
                value={minutesToTime(day.endTime)}
                onChange={(event) => {
                  const minutes = timeToMinutes(event.target.value);
                  if (minutes !== null) patchDay(day.weekday, { endTime: minutes });
                }}
                className="h-9 rounded-lg border border-border bg-surface-3 px-2 text-fg"
              />
              <span className="ml-2">Almoço</span>
              <input
                aria-label={`Início do almoço ${WEEKDAY_LABELS[day.weekday]}`}
                type="time"
                value={day.lunchStart !== null ? minutesToTime(day.lunchStart) : ''}
                onChange={(event) => {
                  const minutes = timeToMinutes(event.target.value);
                  patchDay(day.weekday, { lunchStart: minutes });
                }}
                className="h-9 rounded-lg border border-border bg-surface-3 px-2 text-fg"
              />
              <span>até</span>
              <input
                aria-label={`Fim do almoço ${WEEKDAY_LABELS[day.weekday]}`}
                type="time"
                value={day.lunchEnd !== null ? minutesToTime(day.lunchEnd) : ''}
                onChange={(event) => {
                  const minutes = timeToMinutes(event.target.value);
                  patchDay(day.weekday, { lunchEnd: minutes });
                }}
                className="h-9 rounded-lg border border-border bg-surface-3 px-2 text-fg"
              />
            </div>
          )}
        </div>
      ))}

      <Button className="self-end" loading={update.isPending} onClick={() => void save()}>
        Salvar escala
      </Button>
    </div>
  );
}
