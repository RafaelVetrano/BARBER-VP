'use client';

import { cn } from '@barbervp/ui';
import type { StaffAgendaResponse, StaffAppointmentItem } from '@barbervp/types';
import {
  STATUS_BLOCK_CLASSES,
  formatTime,
  formatWeekDayLabel,
  shouldWarnNoShow,
  todayKey,
} from './agenda-shared';

export interface AgendaWeekGridProps {
  agenda: StaffAgendaResponse;
  onOpenAppointment: (appointment: StaffAppointmentItem) => void;
  /** Clique no cabeçalho do dia leva para a visão Dia daquela data. */
  onOpenDay: (date: string) => void;
}

/**
 * Visão Semana (`Dashboard.dc.html` l.484–499): sete cartões lado a lado, cada
 * um listando os atendimentos do dia.
 *
 * Só a partir de `lg` — a regra de responsividade da fase manda a Semana e a
 * Timeline sumirem no mobile, onde a visão Dia é a única legível. Quem chama
 * garante o fallback.
 */
export function AgendaWeekGrid({ agenda, onOpenAppointment, onOpenDay }: AgendaWeekGridProps) {
  const today = todayKey();

  return (
    <div className="grid grid-cols-7 gap-3">
      {agenda.days.map((day) => {
        const label = formatWeekDayLabel(day.date);
        const appointments = day.barbers
          .flatMap((column) => column.appointments)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

        return (
          <div
            key={day.date}
            className="flex min-h-[260px] flex-col gap-2 rounded-[10px] border border-border bg-surface p-2.5"
          >
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => onOpenDay(day.date)}
                className="whitespace-nowrap text-[13px] font-semibold text-fg transition-colors hover:text-gold"
              >
                {label.weekday} {label.date}
              </button>
              {day.date === today && (
                <span className="rounded-[10px] bg-gold px-1.5 py-0.5 text-[10px] font-bold text-bg">
                  Hoje
                </span>
              )}
            </div>

            {appointments.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-fg-subtle">Sem agendamentos</p>
            ) : (
              <div className="flex flex-col gap-2">
                {appointments.map((appointment) => {
                  const tone = STATUS_BLOCK_CLASSES[appointment.status];
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => onOpenAppointment(appointment)}
                      className={cn(
                        'truncate rounded-md border px-1.5 py-1 text-left text-[11px] font-medium text-fg',
                        tone.block,
                      )}
                    >
                      <span className={cn('font-semibold tabular-nums', tone.text)}>
                        {formatTime(appointment.startsAt, agenda.timezone)}
                      </span>{' '}
                      {appointment.clientName}
                      {shouldWarnNoShow(appointment) && (
                        <span title="Cliente com 2+ faltas" className="text-warning">
                          {' '}
                          ⚠
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
