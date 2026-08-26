'use client';

import { Skeleton, cn } from '@barbervp/ui';
import type { StaffAgendaMonthResponse } from '@barbervp/types';
import { formatMonthLabel } from './agenda-shared';

const WEEKDAY_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export interface AgendaMonthGridProps {
  month: StaffAgendaMonthResponse | undefined;
  /** Data de referência — dá o título quando os dados ainda não chegaram. */
  date: string;
  loading: boolean;
  onOpenDay: (date: string) => void;
}

/**
 * Visão Mês (`Dashboard.dc.html` l.502–530): calendário com a contagem de
 * agendamentos e a barra de ocupação por dia. A semana começa na segunda.
 */
export function AgendaMonthGrid({ month, date, loading, onOpenDay }: AgendaMonthGridProps) {
  return (
    <div>
      <p className="mb-3 text-center text-base font-semibold capitalize text-fg">
        {formatMonthLabel(date)}
      </p>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-[10px] border border-border bg-border">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="bg-bg p-2 text-center text-[11px] font-semibold text-fg-muted">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-[10px] border border-t-0 border-border bg-border">
        {loading && !month
          ? Array.from({ length: 35 }, (_, index) => (
              <div key={index} className="min-h-[88px] bg-surface p-2">
                <Skeleton className="h-4 w-6" />
              </div>
            ))
          : (
              <>
                {Array.from({ length: month?.leadingBlanks ?? 0 }, (_, index) => (
                  <div key={`blank-${index}`} className="min-h-[88px] bg-bg" />
                ))}

                {(month?.cells ?? []).map((cell) => (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => onOpenDay(cell.date)}
                    className="flex min-h-[88px] flex-col gap-1.5 bg-surface p-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        'text-[13px] font-semibold',
                        cell.isToday
                          ? 'flex size-6 items-center justify-center rounded-full bg-gold text-bg'
                          : 'text-fg',
                      )}
                    >
                      {cell.day}
                    </span>
                    <span className="text-[11px] text-fg-muted">{cell.appointmentCount} agend.</span>
                    <div
                      className="mt-auto h-1 overflow-hidden rounded-sm bg-border"
                      title={`Ocupação: ${cell.occupancyPct}%`}
                    >
                      <div className="h-full bg-gold" style={{ width: `${cell.occupancyPct}%` }} />
                    </div>
                  </button>
                ))}
              </>
            )}
      </div>
    </div>
  );
}
