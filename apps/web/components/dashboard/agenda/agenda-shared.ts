import { ApiError } from '@barbervp/ui';
import { AppointmentStatus, ErrorCode } from '@barbervp/types';
import type { StaffAppointmentItem } from '@barbervp/types';

/**
 * Alerta "Cliente com 2+ faltas" (⚠ do protótipo, l.467 e l.3846).
 *
 * O limiar é 2 porque é o que o protótipo desenha; o BLOQUEIO automático usa
 * outro número, configurável em `TenantSettings.bloquearFaltasQtd` — o aviso
 * existe justamente para o balcão ver a reincidência ANTES do bloqueio.
 */
export const NO_SHOW_WARN_THRESHOLD = 2;

export function shouldWarnNoShow(appointment: Pick<StaffAppointmentItem, 'clientNoShowCount'>): boolean {
  return appointment.clientNoShowCount >= NO_SHOW_WARN_THRESHOLD;
}

/** Agendamento que já não aceita ação (o backend responde 409 nesses casos). */
export function isClosed(status: AppointmentStatus): boolean {
  return (
    status === AppointmentStatus.CANCELED ||
    status === AppointmentStatus.DONE ||
    status === AppointmentStatus.NO_SHOW
  );
}

/**
 * Cor do bloco na grade, por status.
 *
 * As classes saem dos tokens do design system — os hex do protótipo
 * (`#3FB68B`, `#E8A13C`…) são exatamente `success`/`warning`/`info`/`danger`,
 * então nada de cor literal chega ao componente.
 */
export const STATUS_BLOCK_CLASSES: Record<AppointmentStatus, { block: string; text: string }> = {
  [AppointmentStatus.SCHEDULED]: { block: 'border-warning/40 bg-warning/[0.13]', text: 'text-warning' },
  [AppointmentStatus.CONFIRMED]: { block: 'border-success/40 bg-success/[0.13]', text: 'text-success' },
  [AppointmentStatus.DONE]: { block: 'border-info/40 bg-info/[0.13]', text: 'text-info' },
  [AppointmentStatus.NO_SHOW]: { block: 'border-danger/40 bg-danger/[0.13]', text: 'text-danger' },
  [AppointmentStatus.CANCELED]: { block: 'border-border bg-surface-3', text: 'text-fg-muted' },
};

/** `YYYY-MM-DD` de hoje no fuso do navegador. */
export function todayKey(): string {
  return dateToKey(new Date());
}

export function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function keyToDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const date = keyToDate(dateKey);
  date.setDate(date.getDate() + days);
  return dateToKey(date);
}

export function addMonthsToKey(dateKey: string, months: number): string {
  const date = keyToDate(dateKey);
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  return dateToKey(date);
}

/** `540` → `09:00`. */
export function minutesToLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Minutos locais (no fuso do tenant) de um instante ISO. */
export function minutesOfDay(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso));
  const [hours, minutes] = parts.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** `sexta-feira, 21 de agosto` — o rótulo da barra superior (l.404). */
export function formatAgendaDate(dateKey: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(keyToDate(dateKey));
}

export function formatMonthLabel(dateKey: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(keyToDate(dateKey));
}

/** Cabeçalho de coluna da visão Semana: `Seg 12/05`. */
export function formatWeekDayLabel(dateKey: string): { weekday: string; date: string } {
  const date = keyToDate(dateKey);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date);
  return {
    // `Intl` devolve "seg." — o protótipo escreve "Seg".
    weekday: weekday.replace('.', '').replace(/^./, (char) => char.toUpperCase()),
    date: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`,
  };
}

/** Horário no fuso do tenant — `HH:MM`. */
export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso));
}

/** Mensagem de conflito de horário (409 do motor de disponibilidade). */
export const CONFLICT_MESSAGE =
  'Esse horário acabou de ser ocupado. A grade foi atualizada — escolha outro.';

/**
 * Mensagem de erro para o toast.
 *
 * O 409 de `DOUBLE_BOOKING` ganha texto próprio porque é o único erro desta
 * aba em que o operador precisa fazer algo específico (escolher outro
 * horário na grade recém-atualizada), e não apenas tentar de novo.
 */
export function agendaErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.code === ErrorCode.DOUBLE_BOOKING ? CONFLICT_MESSAGE : error.message;
  }
  return error instanceof Error ? error.message : 'Não foi possível concluir a ação.';
}
