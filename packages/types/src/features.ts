/**
 * Feature flags do SaaS — mapa real extraído do Dashboard (SPEC.md).
 * Gate SEMPRE server-side (403 no endpoint); o frontend só espelha com upsell.
 */

export const PlanTier = {
  ESSENCIAL: 0,
  PROFISSIONAL: 1,
  AVANCADO: 2,
} as const;
export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

export const FEATURE_KEYS = [
  'contasPagarReceber',
  'vales',
  'comissoes',
  'fidelidadePontos',
  'fidelidadeSorteios',
  'whatsappCompleto',
  'relatoriosAvancados',
  'fidelidadeAssinaturas',
  'multiUnidades',
  'calculadoraPreco',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Tier mínimo de cada feature. */
export const FEATURE_MIN_TIER: Record<FeatureKey, PlanTier> = {
  contasPagarReceber: PlanTier.PROFISSIONAL,
  vales: PlanTier.PROFISSIONAL,
  comissoes: PlanTier.PROFISSIONAL,
  fidelidadePontos: PlanTier.PROFISSIONAL,
  fidelidadeSorteios: PlanTier.PROFISSIONAL,
  whatsappCompleto: PlanTier.PROFISSIONAL,
  relatoriosAvancados: PlanTier.PROFISSIONAL,
  fidelidadeAssinaturas: PlanTier.AVANCADO,
  multiUnidades: PlanTier.AVANCADO,
  calculadoraPreco: PlanTier.AVANCADO,
};

/** Shape de `SaasPlan.features` (Json). */
export type PlanFeatures = Record<FeatureKey, boolean>;

/** `maxBarbeiros` por tier — `null` = ilimitado. */
export const MAX_BARBERS_BY_TIER: Record<PlanTier, number | null> = {
  [PlanTier.ESSENCIAL]: 2,
  [PlanTier.PROFISSIONAL]: 4,
  [PlanTier.AVANCADO]: null,
};

/** Gera o mapa completo de features para um tier. */
export function featuresForTier(tier: PlanTier): PlanFeatures {
  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = tier >= FEATURE_MIN_TIER[key];
    return acc;
  }, {} as PlanFeatures);
}

export function hasFeature(features: unknown, key: FeatureKey): boolean {
  return (
    typeof features === 'object' &&
    features !== null &&
    (features as Record<string, unknown>)[key] === true
  );
}
