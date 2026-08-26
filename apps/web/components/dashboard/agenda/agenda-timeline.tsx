'use client';

import { Avatar, EmptyState, cn } from '@barbervp/ui';
import type { StaffAgendaDay, StaffAgendaResponse, StaffAppointmentItem } from '@barbervp/types';
import { STATUS_BLOCK_CLASSES, minutesOfDay, minutesToLabel } from './agenda-shared';

export interface AgendaTimelineProps {
  day: StaffAgendaDay;
  agenda: StaffAgendaResponse;
  onOpenAppointment: (appointment: StaffAppointmentItem) => void;
}

/**
 * Visão Timeline por barbeiro (`Dashboard.dc.html` l.533–560): uma faixa
 * horizontal por profissional, com o dia inteiro comprimido na largura.
 *
 * É a visão de ocupação — mostra buracos na agenda de relance, coisa que a
 * grade vertical de colunas esconde quando há muitos barbeiros.
 */
export function AgendaTimeline({ day, agenda, onOpenAppointment }: AgendaTimelineProps) {
  const { gridStartMinutes: start, gridEndMinutes: end, timezone } = agenda;
  const span = end - start;

  if (day.barbers.length === 0) {
    return <EmptyState message="Nenhum barbeiro ativo para exibir nesta agenda." />;
  }
  if (span <= 0) {
    return (
      <EmptyState
        message="Ninguém trabalha neste dia"
        description="Sem expediente na escala e sem horário de funcionamento configurado para esta data."
      />
    );
  }

  const hours: number[] = [];
  for (let minute = Math.ceil(start / 60) * 60; minute <= end; minute += 60) {
    hours.push(minute);
  }

  const pct = (minutes: number) => ((minutes - start) / span) * 100;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      {/* ── Régua de horas ── */}
      <div className="flex">
        <div className="w-[130px] shrink-0" />
        <div className="relative h-[18px] flex-1">
          {hours.map((minute) => (
            <span
              key={minute}
              className="absolute text-[11px] font-medium tabular-nums text-fg-subtle"
              style={{ left: `${pct(minute)}%` }}
            >
              {minutesToLabel(minute)}
            </span>
          ))}
        </div>
      </div>

      {day.barbers.map((column) => (
        <div key={column.barberId} className="flex items-center">
          <div className="flex w-[130px] shrink-0 items-center gap-2">
            <Avatar name={column.barberName} src={column.avatarUrl} size="sm" />
            <span className="truncate text-[13px] font-medium text-fg">{column.barberName}</span>
          </div>

          <div className="relative h-10 flex-1 rounded-md bg-bg">
            {/* Almoço e bloqueios entram na faixa como zona morta. */}
            {column.lunchStartMinutes !== null && column.lunchEndMinutes !== null && (
              <TimelineBand
                from={column.lunchStartMinutes}
                to={column.lunchEndMinutes}
                pct={pct}
                label="Almoço"
              />
            )}
            {column.blocks.map((block) => (
              <TimelineBand
                key={block.id}
                from={block.startMinutes}
                to={block.endMinutes}
                pct={pct}
                label={block.reason ?? 'Bloqueado'}
              />
            ))}

            {column.appointments.map((appointment) => {
              const from = minutesOfDay(appointment.startsAt, timezone);
              const tone = STATUS_BLOCK_CLASSES[appointment.status];

              return (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() => onOpenAppointment(appointment)}
                  title={`${minutesToLabel(from)} · ${appointment.clientName}`}
                  className={cn(
                    'absolute inset-y-1 flex items-center overflow-hidden rounded border px-1.5',
                    tone.block,
                  )}
                  style={{
                    left: `${pct(from)}%`,
                    width: `${Math.max((appointment.durationMin / span) * 100, 1)}%`,
                  }}
                >
                  <span className="truncate text-[10px] font-medium text-fg">
                    {appointment.clientName}
                  </span>
                </button>
              );
            })}

            {column.workStartMinutes === null && (
              <span className="absolute inset-0 flex items-center justify-center text-[11px] text-fg-subtle">
                Sem expediente
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineBand({
  from,
  to,
  pct,
  label,
}: {
  from: number;
  to: number;
  pct: (minutes: number) => number;
  label: string;
}) {
  return (
    <div
      aria-hidden
      title={label}
      className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,theme(colors.border.DEFAULT),theme(colors.border.DEFAULT)_5px,transparent_5px,transparent_10px)]"
      style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }}
    />
  );
}
