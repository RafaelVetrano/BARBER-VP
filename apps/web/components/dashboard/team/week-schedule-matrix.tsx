'use client';

import { Avatar, Button, EmptyState } from '@barbervp/ui';
import { ScheduleExceptionType, WEEKDAY_LABELS, minutesToTime } from '@barbervp/types';
import type { BarberListItem, ScheduleExceptionItem } from '@barbervp/types';

/** Domingo da semana corrente — a matriz do protótipo é Dom→Sáb. */
function startOfWeek(today = new Date()): Date {
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  return sunday;
}

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const RANGE_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Escala semanal (`Dashboard.dc.html` l.2092–2116): uma linha por barbeiro,
 * sete colunas de dia, o horário em cada célula.
 *
 * A matriz é de LEITURA — no desenho não há campo editável aqui. Clicar numa
 * célula abre o mesmo modal do "Editar" do card, que é onde os horários se
 * mexem; assim a escala tem um único lugar de edição em vez de dois que
 * podem discordar.
 *
 * O ícone de férias/folga sai das `ScheduleException` que caem DENTRO da
 * semana mostrada — por isso o cabeçalho diz de que semana se trata. Uma
 * matriz de "dias da semana" sem data não teria como marcar férias nenhuma.
 */
export function WeekScheduleMatrix({
  barbers,
  exceptions,
  onEditBarber,
  onNewException,
}: {
  barbers: BarberListItem[];
  exceptions: ScheduleExceptionItem[];
  onEditBarber: (barber: BarberListItem) => void;
  onNewException: () => void;
}) {
  const sunday = startOfWeek();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + index);
    return { weekday: index, date, key: dateKey(date) };
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">
          Semana de {RANGE_FORMAT.format(days[0]!.date)} a {RANGE_FORMAT.format(days[6]!.date)}
        </p>
        {/* O desenho mostra o ícone de férias mas não desenha por onde ela é
            cadastrada. Sem este botão a coluna nunca se preencheria. */}
        <Button variant="outline" size="sm" onClick={onNewException}>
          Registrar folga ou férias
        </Button>
      </div>

      {barbers.length === 0 ? (
        <EmptyState message="Nenhum barbeiro na equipe ainda. A escala aparece assim que o primeiro entrar." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4">
          <div
            role="table"
            aria-label="Escala semanal da equipe"
            className="grid min-w-[820px] gap-2.5"
            style={{ gridTemplateColumns: '180px repeat(7, minmax(0, 1fr))' }}
          >
            <div role="columnheader" aria-label="Barbeiro" />
            {days.map((day) => (
              <div
                key={day.key}
                role="columnheader"
                className="pb-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.4px] text-fg-muted"
              >
                {WEEKDAY_LABELS[day.weekday]!.slice(0, 3)}
              </div>
            ))}

            {barbers.map((barber) => (
              <BarberRow
                key={barber.id}
                barber={barber}
                days={days}
                exceptions={exceptions}
                onEdit={() => onEditBarber(barber)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BarberRow({
  barber,
  days,
  exceptions,
  onEdit,
}: {
  barber: BarberListItem;
  days: Array<{ weekday: number; key: string }>;
  exceptions: ScheduleExceptionItem[];
  onEdit: () => void;
}) {
  return (
    <>
      <div role="rowheader" className="flex items-center gap-2 py-1.5">
        <Avatar name={barber.name} src={barber.avatarUrl} size="xs" />
        <span className="truncate text-[13px] font-semibold text-fg">{barber.name}</span>
      </div>

      {days.map((day) => {
        const scheduled = barber.workSchedule.find((row) => row.weekday === day.weekday);
        const exception = exceptionFor(exceptions, barber.id, day.key);
        const cell = describeCell(scheduled, exception);

        return (
          <button
            key={`${barber.id}-${day.key}`}
            type="button"
            onClick={onEdit}
            aria-label={`${barber.name}, ${WEEKDAY_LABELS[day.weekday]}: ${cell.label}. Abrir para editar.`}
            className={`flex min-h-11 items-center justify-center gap-1 rounded-lg border px-1 text-center text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${cell.className}`}
          >
            {cell.icon}
            <span>{cell.label}</span>
          </button>
        );
      })}
    </>
  );
}

/** A exceção que cobre o dia — a do barbeiro vence a da barbearia inteira. */
function exceptionFor(
  exceptions: ScheduleExceptionItem[],
  barberId: string,
  day: string,
): ScheduleExceptionItem | undefined {
  const covering = exceptions.filter(
    (row) =>
      (row.barberId === barberId || row.barberId === null) &&
      row.startDate <= day &&
      row.endDate >= day,
  );
  return covering.find((row) => row.barberId === barberId) ?? covering[0];
}

function describeCell(
  scheduled: { startTime: number; endTime: number; isDayOff: boolean } | undefined,
  exception: ScheduleExceptionItem | undefined,
): { label: string; className: string; icon?: React.ReactNode } {
  if (exception && exception.type !== ScheduleExceptionType.CUSTOM_HOURS) {
    return {
      label: EXCEPTION_LABEL[exception.type],
      className: 'border-dashed border-border bg-surface-2 text-fg-muted',
      icon: <PalmIcon />,
    };
  }

  if (exception?.type === ScheduleExceptionType.CUSTOM_HOURS && exception.startTime !== null && exception.endTime !== null) {
    return {
      label: `${minutesToTime(exception.startTime)}–${minutesToTime(exception.endTime)}`,
      className: 'border-gold/40 bg-gold/10 text-gold',
    };
  }

  if (!scheduled || scheduled.isDayOff) {
    return { label: 'Folga', className: 'border-border bg-surface-2 text-fg-muted' };
  }

  return {
    label: `${minutesToTime(scheduled.startTime)}–${minutesToTime(scheduled.endTime)}`,
    className: 'border-border bg-surface-2 text-fg',
  };
}

const EXCEPTION_LABEL: Record<ScheduleExceptionItem['type'], string> = {
  DAY_OFF: 'Folga',
  VACATION: 'Férias',
  HOLIDAY: 'Feriado',
  CUSTOM_HOURS: 'Horário especial',
};

/** A palmeira do protótipo (l.2110) — o dia de férias. */
function PalmIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M2 22s2-8 10-8 10 8 10 8M6 14c0-6 4-11 6-11s6 5 6 11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
