/**
 * Contrato de erro da API — `{ code, message, details? }` (SPEC.md → Convenções).
 * O filtro global de exceções da API sempre responde neste formato.
 */

export const ErrorCode = {
  // 400
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  // 401 / 403
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  TENANT_REQUIRED: 'TENANT_REQUIRED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  FEATURE_NOT_IN_PLAN: 'FEATURE_NOT_IN_PLAN',
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',
  ACCOUNT_NOT_VERIFIED: 'ACCOUNT_NOT_VERIFIED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  /// Tenant suspenso pelo super admin (fase 08) — distinto de `ACCOUNT_DISABLED`
  /// (que é sobre o `User`, não sobre a barbearia).
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  // 404 / 409
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DOUBLE_BOOKING: 'DOUBLE_BOOKING',
  SUBSCRIPTION_QUOTA_EXCEEDED: 'SUBSCRIPTION_QUOTA_EXCEEDED',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  PHONE_IN_USE: 'PHONE_IN_USE',
  SLUG_IN_USE: 'SLUG_IN_USE',
  /// Slug que pertence a uma rota do produto (`/entrar`, `/cadastro`…) — a
  /// barbearia nunca abriria nesse endereço. Distinto de `SLUG_IN_USE`: não
  /// há outra barbearia com ele, e trocar de nome é a única saída.
  SLUG_RESERVED: 'SLUG_RESERVED',
  /// `POST /onboarding/complete` com passo OBRIGATÓRIO faltando (1, 2, 4 ou 6).
  /// `details.missingSteps` traz os números que faltam. É o que impede pular o
  /// wizard inteiro chamando a rota direto — a obrigatoriedade é do servidor,
  /// não do guard do navegador (agente 30).
  ONBOARDING_INCOMPLETE: 'ONBOARDING_INCOMPLETE',
  // OTP (fase 03)
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_MAX_ATTEMPTS: 'OTP_MAX_ATTEMPTS',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
  // 415 / 413 — upload de imagem (fase 25, `StorageAdapter`)
  /// Arquivo que não é JPG/PNG/WebP.
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  /// Imagem acima do teto do storage (5 MB), recusada ANTES de tocar o disco.
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  // 413
  /// Corpo acima do teto do `main.ts`. O body-parser recusa antes de qualquer
  /// controller, então nenhum módulo de negócio precisa se defender disso.
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  // 429
  RATE_LIMITED: 'RATE_LIMITED',
  // 500+
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  code: ErrorCode | string;
  message: string;
  details?: unknown;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorBody).code === 'string' &&
    typeof (value as ApiErrorBody).message === 'string'
  );
}
