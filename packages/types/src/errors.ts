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
  // OTP (fase 03)
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_MAX_ATTEMPTS: 'OTP_MAX_ATTEMPTS',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
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
