import { ApiError } from '@barbervp/ui';
import { PAYMENT_METHOD_LABEL, formatBRL } from '@barbervp/types';
import type { AccountStatus, PaymentMethod } from '@barbervp/types';

/**
 * Peças comuns às 6 sub-abas do Financeiro. Tudo aqui é RÓTULO ou FORMATO —
 * nenhum valor: os números vêm sempre da API (`Dashboard.dc.html` l.718–1088).
 */

/** `STATUS_STYLE` do protótipo, mapeado nos tons do design system. */
export const ACCOUNT_STATUS_TONE: Record<AccountStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  RECEIVED: 'success',
  PENDING: 'warning',
  OVERDUE: 'danger',
  CANCELED: 'neutral',
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  PAID: 'Pago',
  RECEIVED: 'Recebido',
  PENDING: 'Pendente',
  OVERDUE: 'Vencido',
  CANCELED: 'Cancelado',
};

export function methodLabel(method: PaymentMethod | string): string {
  return PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method;
}

/** `dd/mm/aaaa` a partir de um `YYYY-MM-DD` — sem passar por `Date`, que ao
 * interpretar a string como UTC e imprimir no fuso local adianta o dia para
 * quem está a oeste de Greenwich (todo o Brasil). */
export function formatDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** `14:35` no fuso da barbearia — mesma convenção da Agenda e do POS. */
export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso));
}

/** `8/12` na coluna "Parcela"; `—` quando a conta não é parcelada. */
export function installmentLabel(installment: number, installments: number): string {
  return installments > 1 ? `${installment}/${installments}` : '—';
}

/** `+R$ 260,00` / `-R$ 80,00` — o sinal que colore a linha do extrato. */
export function formatSigned(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}${formatBRL(Math.abs(cents))}`;
}

/**
 * Centavos digitados como texto livre (`10`, `10,50`, `1.234,56`). Tolerante
 * de propósito, como no POS: `parseBRLToCents` lança em entrada parcial e o
 * campo é validado a cada tecla.
 */
export function inputToCents(input: string): number {
  const normalized = input.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

/** Mensagem do servidor quando existe — o Financeiro devolve motivos úteis
 * ("Já existe um caixa aberto", "Esta conta já está paga"). */
export function financeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Hoje em `YYYY-MM-DD`, no fuso de quem preenche o formulário. */
export function todayInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
