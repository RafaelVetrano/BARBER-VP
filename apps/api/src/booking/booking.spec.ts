import { formatDuration, periodOfMinutes, SlotPeriod } from '@barbervp/types';
import { subtractWindow } from './availability.service';
import { generateBookingCode, normalizeBookingCode } from './booking-code';
import { isWithinChangeWindow, isExclusionViolation } from './appointments.service';
import { renderTemplate, type AppointmentMessageContext } from './booking-notifications.service';

describe('subtractWindow (almoço na janela de trabalho)', () => {
  it('parte a janela em duas quando o almoço fica no meio', () => {
    expect(subtractWindow([{ start: 540, end: 1200 }], { start: 720, end: 780 })).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1200 },
    ]);
  });

  it('encurta a janela quando o almoço encosta na borda', () => {
    expect(subtractWindow([{ start: 540, end: 1200 }], { start: 540, end: 600 })).toEqual([
      { start: 600, end: 1200 },
    ]);
    expect(subtractWindow([{ start: 540, end: 1200 }], { start: 1140, end: 1200 })).toEqual([
      { start: 540, end: 1140 },
    ]);
  });

  it('ignora almoço fora do expediente', () => {
    expect(subtractWindow([{ start: 540, end: 720 }], { start: 780, end: 840 })).toEqual([
      { start: 540, end: 720 },
    ]);
  });

  it('zera a janela quando o almoço a cobre inteira', () => {
    expect(subtractWindow([{ start: 540, end: 720 }], { start: 480, end: 780 })).toEqual([]);
  });
});

describe('faixas do dia', () => {
  it('agrupa como a grade do wizard (MANHÃ/TARDE/NOITE)', () => {
    expect(periodOfMinutes(9 * 60)).toBe(SlotPeriod.MORNING);
    expect(periodOfMinutes(11 * 60 + 59)).toBe(SlotPeriod.MORNING);
    expect(periodOfMinutes(12 * 60)).toBe(SlotPeriod.AFTERNOON);
    expect(periodOfMinutes(17 * 60 + 59)).toBe(SlotPeriod.AFTERNOON);
    expect(periodOfMinutes(18 * 60)).toBe(SlotPeriod.EVENING);
  });
});

describe('formatDuration', () => {
  it('reproduz o rótulo do protótipo', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(70)).toBe('1h10');
    expect(formatDuration(120)).toBe('2h');
  });
});

describe('código de reserva', () => {
  it('sai no formato AG-XXXXX, sem caracteres ambíguos', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateBookingCode();
      expect(code).toMatch(/^AG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/);
    }
  });

  it('não repete em 2 mil sorteios (entropia suficiente para a colisão ser rara)', () => {
    const seen = new Set(Array.from({ length: 2_000 }, () => generateBookingCode()));
    expect(seen.size).toBe(2_000);
  });

  it('normaliza o que o cliente digita', () => {
    expect(normalizeBookingCode('ag-4x2 1b')).toBe('AG-4X21B');
    expect(normalizeBookingCode('AG-4X21B')).toBe('AG-4X21B');
    expect(normalizeBookingCode('4x21b')).toBe('AG-4X21B');
  });
});

describe('janela de cancelamento', () => {
  it('libera enquanto faltar mais que a antecedência do tenant', () => {
    const inThreeHours = new Date(Date.now() + 3 * 3_600_000);
    expect(isWithinChangeWindow(inThreeHours, 2)).toBe(true);
    expect(isWithinChangeWindow(inThreeHours, 4)).toBe(false);
  });

  it('bloqueia horário que já passou', () => {
    expect(isWithinChangeWindow(new Date(Date.now() - 60_000), 2)).toBe(false);
  });
});

describe('detecção da EXCLUDE no_double_booking', () => {
  it('reconhece o SQLSTATE 23P01 e o nome da constraint', () => {
    expect(isExclusionViolation(new Error('conflicting key value violates exclusion constraint "no_double_booking"'))).toBe(true);
    expect(isExclusionViolation(new Error('ERROR: 23P01'))).toBe(true);
  });

  it('não confunde com outros erros', () => {
    expect(isExclusionViolation(new Error('connection refused'))).toBe(false);
    expect(isExclusionViolation(null)).toBe(false);
  });
});

describe('renderTemplate', () => {
  const context: AppointmentMessageContext = {
    tenantId: 't1',
    tenantName: 'Barbearia Central',
    tenantSlug: 'barbearia-central',
    timezone: 'America/Sao_Paulo',
    appointmentId: 'a1',
    bookingCode: 'AG-4X21B',
    recipientPhone: '5516999990001',
    clientName: 'João Pedro Lima',
    barberName: 'Carlos Silva',
    serviceNames: ['Corte Masculino', 'Barba'],
    // 2026-08-17T12:00Z = segunda, 17 de agosto, 09:00 em São Paulo.
    startsAt: new Date('2026-08-17T12:00:00.000Z'),
  };

  it('substitui os placeholders no fuso da barbearia', () => {
    const body = renderTemplate(
      'Olá {nome}! {data} às {horario} — {servico} com {barbeiro}. {link_agendamento}',
      context,
      'https://agenda.test/barbearia-central',
    );

    expect(body).toBe(
      'Olá João! segunda-feira, 17 de agosto às 09:00 — Corte Masculino + Barba com Carlos Silva. https://agenda.test/barbearia-central',
    );
  });

  it('deixa intacto placeholder desconhecido, em vez de apagar texto do dono', () => {
    expect(renderTemplate('Oi {nome}, {cupom}!', context, 'x')).toBe('Oi João, {cupom}!');
  });
});
