import { addDays, toDateKey, zonedTimeToUtc, type DateKey } from '../common/utils/timezone';

/**
 * Janelas de tempo do Dashboard, sempre no fuso da barbearia.
 *
 * "Hoje" no dashboard é o dia do relógio da barbearia, não o do servidor nem o
 * do navegador: um tenant em Manaus fechando o caixa às 23h não pode ver o
 * faturamento saltar para o dia seguinte porque o container roda em UTC.
 */

export interface Range {
  from: Date;
  to: Date;
}

/** `YYYY-MM`. */
export type MonthKey = string;

/** Meia-noite local a meia-noite local do dia seguinte. */
export function dayRange(dateKey: DateKey, timeZone: string): Range {
  return {
    from: zonedTimeToUtc(dateKey, 0, timeZone),
    to: zonedTimeToUtc(addDays(dateKey, 1), 0, timeZone),
  };
}

/** As `count` chaves de dia terminando em `endKey` (inclusive), da mais antiga. */
export function lastDayKeys(endKey: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, index) => addDays(endKey, index - (count - 1)));
}

export function monthKeyOf(dateKey: DateKey): MonthKey {
  return dateKey.slice(0, 7);
}

export function addMonths(monthKey: MonthKey, delta: number): MonthKey {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total - nextYear * 12 + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

/** As `count` chaves de mês terminando em `endKey` (inclusive), da mais antiga. */
export function lastMonthKeys(endKey: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, index) => addMonths(endKey, index - (count - 1)));
}

/** Primeiro instante do mês (local) até o primeiro instante do mês seguinte. */
export function monthRange(monthKey: MonthKey, timeZone: string): Range {
  return {
    from: zonedTimeToUtc(`${monthKey}-01`, 0, timeZone),
    to: zonedTimeToUtc(`${addMonths(monthKey, 1)}-01`, 0, timeZone),
  };
}

/** Hoje no fuso da barbearia. */
export function todayKey(timeZone: string, now = new Date()): DateKey {
  return toDateKey(now, timeZone);
}

/**
 * Variação percentual entre dois períodos.
 *
 * `null` — e não `0` — quando a base é zero: "não dá para comparar" é uma
 * afirmação diferente de "não mudou", e a UI pinta as duas de formas
 * diferentes (sem seta vs. seta cinza).
 */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

/** Iniciais como o protótipo mostra no ranking: primeiro + último nome, 2 letras. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
