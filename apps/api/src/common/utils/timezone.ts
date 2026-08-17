/**
 * Conversão entre o relógio de parede da barbearia e o instante em UTC.
 *
 * O schema guarda horário de agenda como minutos desde a meia-noite NO FUSO DO
 * TENANT (`WorkSchedule.startTime` = 540 ⇒ 09:00 local) e instantes como
 * `Timestamptz`. Alguém precisa costurar os dois, e esse alguém é este arquivo.
 *
 * Usa a `Intl` do próprio Node em vez de `date-fns-tz`/`luxon`: a base de fusos
 * do ICU já vem embutida, é a mesma que o Postgres consulta, e evita uma
 * dependência para resolver o que são ~40 linhas. A dívida da fase 01 ("o seed
 * converte com offset fixo de -3h; se o horário de verão voltar, trocar por lib
 * de timezone") fica resolvida aqui: um `America/Sao_Paulo` com DST volta a
 * funcionar sozinho, porque o offset é perguntado data a data.
 */

/** `YYYY-MM-DD` — a chave de dia usada em toda a API de disponibilidade. */
export type DateKey = string;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Como o relógio da barbearia mostra este instante. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    return Number(value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** Offset do fuso NAQUELE instante, em minutos (São Paulo = -180). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // `asUtc` é o relógio local lido como se fosse UTC: a diferença para o
  // instante real é exatamente o offset.
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Relógio de parede → instante UTC.
 *
 * Resolve duas vezes de propósito: o offset depende do instante, e o instante é
 * justamente o que estamos calculando. A segunda passada corrige a virada de
 * horário de verão (a primeira estima com o offset do lado errado da mudança).
 */
export function zonedTimeToUtc(
  dateKey: DateKey,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(year, month - 1, day, 0, minutesFromMidnight);

  const firstGuess = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000;
  const settled = naive - zoneOffsetMinutes(new Date(firstGuess), timeZone) * 60_000;

  return new Date(settled);
}

/** Instante UTC → dia no fuso do tenant (`YYYY-MM-DD`). */
export function toDateKey(instant: Date, timeZone: string): DateKey {
  const { year, month, day } = zonedParts(instant, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Instante UTC → minutos desde a meia-noite local. */
export function toMinutesOfDay(instant: Date, timeZone: string): number {
  const { hour, minute } = zonedParts(instant, timeZone);
  return hour * 60 + minute;
}

/** Dia da semana da chave — 0 = domingo, compatível com `WorkSchedule.weekday`. */
export function weekdayOf(dateKey: DateKey): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

/** Soma dias na chave, sem passar por fuso nenhum (é aritmética de calendário). */
export function addDays(dateKey: DateKey, days: number): DateKey {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return toIsoDate(base);
}

/** Diferença em dias entre duas chaves (`b - a`). */
export function daysBetween(a: DateKey, b: DateKey): number {
  const start = new Date(`${a}T00:00:00.000Z`).getTime();
  const end = new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** Meia-noite UTC da chave — o formato de `@db.Date` no Prisma. */
export function dateKeyToUtcMidnight(dateKey: DateKey): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** Coluna `@db.Date` → chave, sem deslocar o dia pelo fuso do processo. */
export function utcDateToKey(date: Date): DateKey {
  return toIsoDate(date);
}

export function isValidDateKey(value: string): value is DateKey {
  return DATE_KEY_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

/** Fuso reconhecido pelo ICU? Tenant com fuso inválido é erro de cadastro. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

function toIsoDate(date: Date): DateKey {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
