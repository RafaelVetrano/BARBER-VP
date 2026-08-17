/**
 * Dinheiro é SEMPRE `Int` em centavos (SPEC.md → Convenções).
 * Nenhum float atravessa a fronteira API ↔ frontend.
 */

/** Centavos. Use `formatBRL` só na borda de apresentação. */
export type Cents = number;

export function formatBRL(cents: Cents): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/** "45,90" | "45.90" | "R$ 45,90" → 4590 */
export function parseBRLToCents(input: string): Cents {
  const normalized = input
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    throw new Error(`Valor monetário inválido: ${input}`);
  }
  return Math.round(value * 100);
}

/** Desconto percentual em basis points evita float (10% = 1000). */
export function applyPercentDiscount(cents: Cents, percentBps: number): Cents {
  return cents - Math.round((cents * percentBps) / 10_000);
}
