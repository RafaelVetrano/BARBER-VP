import type { ReportPeriodKey, ReportResolvedPeriod } from '@barbervp/types';
import { ApiException } from '../common/errors/api.exception';
import {
  addDays,
  daysBetween,
  isValidDateKey,
  toDateKey,
  zonedTimeToUtc,
  type DateKey,
} from '../common/utils/timezone';

/**
 * As pílulas de período do protótipo, resolvidas NO FUSO DA BARBEARIA.
 *
 * "Hoje" é o dia do relógio da barbearia, não o do container: um tenant em
 * Manaus fechando comanda às 23h não pode ver o relatório de hoje zerar porque
 * já virou o dia em UTC. (Era exatamente o que a versão anterior fazia — ela
 * montava as datas com `T00:00:00.000Z`.)
 */
export interface ResolvedWindow extends ReportResolvedPeriod {
  /** Instantes UTC: `[start, end)`. `end` é a meia-noite do dia SEGUINTE a `to`. */
  start: Date;
  end: Date;
  /** Dias inteiros do recorte — o tamanho da janela de comparação. */
  days: number;
}

export function resolveWindow(
  input: { period?: ReportPeriodKey; from?: string; to?: string },
  timeZone: string,
  now = new Date(),
): ResolvedWindow {
  const today = toDateKey(now, timeZone);
  const key = input.period ?? '30d';

  const [from, to] = rangeFor(key, today, input);
  if (daysBetween(from, to) < 0) {
    throw ApiException.badRequest('A data inicial não pode ser maior que a final.');
  }

  return {
    key,
    from,
    to,
    start: zonedTimeToUtc(from, 0, timeZone),
    end: zonedTimeToUtc(addDays(to, 1), 0, timeZone),
    days: daysBetween(from, to) + 1,
  };
}

/** A janela de MESMO tamanho imediatamente antes — a base do "vs. período anterior". */
export function previousWindow(window: ResolvedWindow, timeZone: string): { start: Date; end: Date } {
  const previousTo = addDays(window.from, -1);
  const previousFrom = addDays(previousTo, -(window.days - 1));
  return {
    start: zonedTimeToUtc(previousFrom, 0, timeZone),
    end: zonedTimeToUtc(window.from, 0, timeZone),
  };
}

function rangeFor(
  key: ReportPeriodKey,
  today: DateKey,
  input: { from?: string; to?: string },
): [DateKey, DateKey] {
  switch (key) {
    case 'hoje':
      return [today, today];
    case '7d':
      return [addDays(today, -6), today];
    case 'mes':
      return [`${today.slice(0, 7)}-01`, today];
    case 'custom': {
      if (!input.from || !input.to || !isValidDateKey(input.from) || !isValidDateKey(input.to)) {
        throw ApiException.badRequest('Informe as duas datas do período personalizado.');
      }
      return [input.from, input.to];
    }
    case '30d':
    default:
      return [addDays(today, -29), today];
  }
}
