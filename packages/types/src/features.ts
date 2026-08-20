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

/**
 * Cópia de marketing do plano — coluna `SaasPlan.marketing`, não `features`.
 *
 * Mora numa coluna própria porque `features` é reconstruído chave a chave a
 * partir de `FEATURE_KEYS` toda vez que o super admin salva um plano
 * (`AdminPlansService.upsert`): texto guardado lá seria apagado no primeiro
 * salvamento. Aqui é conteúdo editável, não flag de permissão — as duas coisas
 * mudam por motivos diferentes e em telas diferentes.
 *
 * `null` na coluna = plano sem cópia de marketing; a landing simplesmente não
 * mostra bullets para ele.
 */
export interface PlanMarketing {
  /** Ex.: "Tudo do Essencial, mais:" — `null` no plano de entrada. */
  baseLabel: string | null;
  /** Bullets exibidos no card da landing, na ordem. */
  features: string[];
}

/** Plano como a landing de vendas o vê — `GET /public/saas-plans`. */
export interface PublicSaasPlan {
  /** O `code` do plano (`essencial` | `profissional` | `avancado`). */
  id: string;
  name: string;
  priceCents: number;
  /** Espelha `isPopular` — o card ganha borda dourada e o selo "★ MAIS POPULAR". */
  highlight: boolean;
  baseLabel: string | null;
  marketingFeatures: string[];
  /** `null` = ilimitado. A landing usa no FAQ ("até N barbeiros"). */
  maxBarbers: number | null;
}

export function planMarketingFrom(value: unknown): PlanMarketing | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const features = Array.isArray(raw['features'])
    ? raw['features'].filter((item): item is string => typeof item === 'string')
    : [];
  const baseLabel = typeof raw['baseLabel'] === 'string' ? raw['baseLabel'] : null;
  return { baseLabel, features };
}
