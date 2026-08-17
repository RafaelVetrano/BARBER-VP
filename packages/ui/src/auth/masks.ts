/**
 * Máscaras de digitação dos formulários.
 *
 * São as MESMAS funções `maskPhone`/`fmtCep` do protótipo: formatam enquanto se
 * digita e nunca rejeitam a tecla — quem valida é o Zod do formulário, com as
 * regras de `@barbervp/types` (as mesmas da API).
 */

/** `16999990001` → `(16) 9 9999-0001`, progressivo enquanto se digita. */
export function maskPhoneInput(value: string): string {
  const digits = (value ?? '').replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';

  let out = `(${digits.slice(0, 2)}`;
  if (digits.length < 3) return out;

  out += ') ';
  // Celular: o nono dígito fica isolado, como em `formatPhoneBR` do protótipo.
  if (digits.length <= 6) {
    return `${out}${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `${out}${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `${out}${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

/** `01310100` → `01310-100`. */
export function maskCepInput(value: string): string {
  const digits = (value ?? '').replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** Só dígitos, no máximo `max` — usado no OTP e em campos numéricos. */
export function digitsOnly(value: string, max?: number): string {
  const digits = (value ?? '').replace(/\D/g, '');
  return max ? digits.slice(0, max) : digits;
}

/** `4500` (centavos) → `45,00`. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** `45,00` / `45` → `4500` centavos. */
export function inputToCents(value: string): number {
  const normalized = (value ?? '').replace(/[^\d,.-]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/** Handle do Instagram sem `@` e sem caracteres que a rede não aceita. */
export function maskInstagramInput(value: string): string {
  return (value ?? '').replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30);
}
