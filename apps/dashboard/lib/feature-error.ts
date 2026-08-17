import { ApiError } from '@barbervp/ui';

/** `true` quando a falha é o 403 `FEATURE_NOT_IN_PLAN` do `FeatureGuard`. */
export function isFeatureGateError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'FEATURE_NOT_IN_PLAN';
}
