import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '@barbervp/types';

export const REQUIRE_FEATURE_KEY = 'requireFeature';

/**
 * Marca um handler/controller como dependente de uma feature do plano SaaS.
 * O `FeatureGuard` (global) lê isto e devolve 403 `FEATURE_NOT_IN_PLAN` quando
 * o tenant não tem a feature — SEMPRE no servidor, nunca só escondendo botão
 * no frontend (regra 4 do SPEC).
 */
export const RequireFeature = (feature: FeatureKey) => SetMetadata(REQUIRE_FEATURE_KEY, feature);
