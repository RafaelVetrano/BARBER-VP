import { randomInt } from 'node:crypto';

/**
 * Alfabeto sem `0`/`O`, `1`/`I`/`L` e `U` (que vira `V` em maiúscula manuscrita).
 * O código é ditado por telefone e digitado à mão — ambiguidade aqui vira
 * atendimento que não encontra a reserva.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

const CODE_LENGTH = 5;

/**
 * Código de reserva no formato do protótipo (`AG-4821`), com entropia
 * suficiente para ninguém adivinhar o do vizinho: 30^5 ≈ 24 milhões por
 * barbearia. É a credencial de quem agendou sem conta, então tem de ser
 * imprevisível — os 4 dígitos sequenciais do protótipo não seriam.
 *
 * A unicidade real é garantida pelo índice `(tenantId, bookingCode)`; quem grava
 * tenta de novo se colidir.
 */
export function generateBookingCode(): string {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `AG-${code}`;
}

/** Normaliza o que o cliente digitou ("ag-4x2 1b" → "AG-4X21B"). */
export function normalizeBookingCode(input: string): string {
  const cleaned = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = cleaned.startsWith('AG') ? cleaned.slice(2) : cleaned;
  return `AG-${body}`;
}
