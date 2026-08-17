import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Hash dos segredos de alta entropia — refresh token, token de reset e código
 * OTP.
 *
 * Aqui NÃO se usa argon2: esses segredos são gerados por nós com entropia
 * suficiente (não são senhas escolhidas por humanos), então não há dicionário a
 * resistir. HMAC-SHA256 com um pepper do ambiente basta, é constante-tempo e
 * roda em microssegundos — importante porque o `/refresh` é chamado a cada 15
 * minutos por sessão ativa.
 *
 * O OTP é a exceção interessante: 6 dígitos têm pouquíssima entropia, mas a
 * defesa dele é o limite de tentativas + expiração, não o custo do hash. O
 * pepper garante que um dump do banco sozinho não revele códigos em voo.
 */
export function hashSecret(secret: string, pepper: string): string {
  return createHmac('sha256', pepper).update(secret).digest('hex');
}

/** Comparação constante-tempo entre dois hashes hex. */
export function secretMatches(candidate: string, stored: string, pepper: string): boolean {
  const computed = Buffer.from(hashSecret(candidate, pepper), 'hex');
  const expected = Buffer.from(stored, 'hex');
  if (computed.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(computed, expected);
}

/** Segredo opaco url-safe — refresh token, token de reset, token de troca. */
export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Código OTP de 6 dígitos, uniformemente distribuído (inclusive com zeros à esquerda). */
export function randomOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
