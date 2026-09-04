import { ApiError } from '@barbervp/ui';
import { PAYMENT_METHOD_LABEL, formatBRL } from '@barbervp/types';
import type { OrderListLine, PaymentMethod } from '@barbervp/types';

/**
 * Os 4 métodos que aparecem no fechamento (`PAYMENT_METHODS` do protótipo,
 * l.4528). `SUBSCRIPTION`/`LOYALTY` existem no enum mas NÃO são formas de
 * pagamento aqui: cobertura por assinatura e resgate de pontos são descontos
 * que reduzem o total a dividir entre estes quatro (decisão da fase 07).
 */
export const SPLIT_METHODS: PaymentMethod[] = ['PIX', 'CASH', 'DEBIT', 'CREDIT'];

/** Rótulo pt-BR — o mapa mora em `@barbervp/types`, nunca copiado por tela. */
export function methodLabel(method: PaymentMethod | string): string {
  return PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method;
}

/** `2× Corte R$ 45,00 · 1× Pomada R$ 30,00` — o resumo do card de comanda aberta. */
export function linesSummary(lines: OrderListLine[]): string {
  return lines
    .map((line) => `${line.quantity}× ${line.description} ${formatBRL(line.unitPriceCents)}`)
    .join(' · ');
}

/**
 * `14:35` no fuso da BARBEARIA, não no do navegador — mesma convenção da
 * Agenda (`agenda-shared.ts`).
 *
 * Importa aqui em particular: a aba "Fechadas hoje" recorta o dia no fuso do
 * tenant, no servidor. Formatar com o fuso de quem olha faria uma comanda
 * listada como de hoje aparecer com hora de ontem para um dono viajando.
 */
export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso));
}

/**
 * Mensagem de erro da API, com fallback. O fechamento devolve motivos
 * específicos (pagamento que não bate, estoque insuficiente, quota de
 * assinatura esgotada) e a tela precisa mostrar o do servidor, não um genérico.
 */
export function posErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * Centavos digitados como texto livre (`10`, `10,50`, `1.234,56`) → centavos.
 * Tolerante de propósito: é um campo que o balconista preenche com o cliente
 * esperando, e `parseBRLToCents` lança em entrada parcial.
 */
export function inputToCents(input: string): number {
  const normalized = input.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

/** Centavos → `1234,56`, o formato que os campos de valor exibem. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
