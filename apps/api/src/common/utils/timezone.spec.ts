import {
  addDays,
  daysBetween,
  isValidDateKey,
  isValidTimeZone,
  toDateKey,
  toMinutesOfDay,
  utcDateToKey,
  weekdayOf,
  zoneOffsetMinutes,
  zonedTimeToUtc,
} from './timezone';

/**
 * O motor de disponibilidade inteiro se apoia nestas conversões: um erro de uma
 * hora aqui vira horário oferecido no almoço do barbeiro ou reserva marcada no
 * dia errado. Por isso os casos incluem justamente as bordas — meia-noite,
 * virada de dia e fusos com e sem horário de verão.
 */
describe('timezone', () => {
  const SP = 'America/Sao_Paulo';

  it('converte relógio de parede para UTC no fuso do tenant', () => {
    // 09:00 em São Paulo (UTC-3) = 12:00Z.
    expect(zonedTimeToUtc('2026-08-17', 9 * 60, SP).toISOString()).toBe('2026-08-17T12:00:00.000Z');
  });

  it('trata a meia-noite local sem escorregar de dia', () => {
    const midnight = zonedTimeToUtc('2026-08-17', 0, SP);
    expect(midnight.toISOString()).toBe('2026-08-17T03:00:00.000Z');
    expect(toDateKey(midnight, SP)).toBe('2026-08-17');
    expect(toMinutesOfDay(midnight, SP)).toBe(0);
  });

  it('faz a volta completa instante → parede → instante', () => {
    const instant = new Date('2026-08-17T21:30:00.000Z');
    const dateKey = toDateKey(instant, SP);
    const minutes = toMinutesOfDay(instant, SP);
    expect(zonedTimeToUtc(dateKey, minutes, SP).toISOString()).toBe(instant.toISOString());
  });

  it('reporta o offset do fuso', () => {
    expect(zoneOffsetMinutes(new Date('2026-08-17T12:00:00Z'), SP)).toBe(-180);
    expect(zoneOffsetMinutes(new Date('2026-08-17T12:00:00Z'), 'UTC')).toBe(0);
  });

  /**
   * A dívida da fase 01 era exatamente esta: offset fixo de -3h só funciona
   * enquanto o Brasil não tiver horário de verão. Nova York tem, e serve de
   * prova de que a conversão pergunta o offset data a data em vez de assumir.
   */
  it('acompanha horário de verão em fuso que o tem', () => {
    const NY = 'America/New_York';
    // Janeiro = EST (-5); julho = EDT (-4).
    expect(zonedTimeToUtc('2026-01-15', 9 * 60, NY).toISOString()).toBe(
      '2026-01-15T14:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-07-15', 9 * 60, NY).toISOString()).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('faz aritmética de calendário sem passar por fuso', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    // 2028 é bissexto.
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-08-17', '2026-08-31')).toBe(14);
  });

  it('calcula o dia da semana compatível com WorkSchedule.weekday', () => {
    // 2026-08-16 é um domingo.
    expect(weekdayOf('2026-08-16')).toBe(0);
    expect(weekdayOf('2026-08-22')).toBe(6);
  });

  it('lê coluna @db.Date sem deslocar o dia', () => {
    expect(utcDateToKey(new Date('2026-08-17T00:00:00.000Z'))).toBe('2026-08-17');
  });

  it('valida chave de data e fuso', () => {
    expect(isValidDateKey('2026-08-17')).toBe(true);
    expect(isValidDateKey('17/08/2026')).toBe(false);
    expect(isValidDateKey('2026-13-40')).toBe(false);
    expect(isValidTimeZone(SP)).toBe(true);
    expect(isValidTimeZone('Marte/Olympus')).toBe(false);
  });
});
