/**
 * Calculadora de preço inteligente — aba "Serviços & Produtos", sub-aba
 * "Calculadora de preço" (`Dashboard.dc.html` l.1856–2022). Plano Avançado.
 *
 * A conta mora AQUI, em função pura, e não no serviço da API nem na página:
 * os dois sliders precisam de resposta imediata (o front recalcula a cada
 * pixel arrastado) e o resultado gravado precisa ser autoritativo (o gate do
 * plano é server-side). Duas implementações da mesma fórmula divergiriam no
 * primeiro arredondamento — esta é a única.
 */

/** Limites dos dois sliders do protótipo (l.1897 `min=100 max=1200 step=10`, l.1905 `min=0 max=60`). */
export const PRICE_CALC_LIMITS = {
  atendimentosMin: 100,
  atendimentosMax: 1200,
  atendimentosStep: 10,
  margemMinBps: 0,
  margemMaxBps: 6000,
} as const;

export interface PriceCalcFixedCostItem {
  id: string;
  name: string;
  amountCents: number;
}

/** O que o dono edita — é isto que `PUT /price-calculator` grava. */
export interface PriceCalculatorConfig {
  fixedCosts: PriceCalcFixedCostItem[];
  custoVariavelCents: number;
  comissaoMediaBps: number;
  atendimentosMes: number;
  margemBps: number;
  precoPraticadoCents: number;
}

/** O que a coluna da direita mostra — nada disto é coluna no banco. */
export interface PriceCalculatorResult {
  /** Soma da lista "Custos fixos mensais". */
  custosFixosTotalCents: number;
  /** `custosFixosTotal / atendimentos` — o KPI da esquerda (l.1913). */
  custoFixoRateadoCents: number;
  /** Rateado + variável: o que um atendimento custa antes da comissão. */
  custoPorAtendimentoCents: number;
  /** O número grande dourado (l.1917). */
  precoMinimoCents: number;
  /** Margem de contribuição do preço praticado, por atendimento. */
  contribuicaoMarginalCents: number;
  /**
   * Atendimentos/mês que pagam os custos fixos no preço praticado.
   * `null` quando a contribuição marginal é ≤ 0 — nesse preço a barbearia
   * perde dinheiro em cada corte e não existe ponto de equilíbrio.
   */
  pontoEquilibrio: number | null;
  /** Lucro líquido do mês na simulação (l.1943) — pode ser negativo. */
  lucroLiquidoCents: number;
  /** Preenchimento da barra azul e posição do marcador dourado (0–100). */
  breakEvenBarPct: number;
  estimadosMarkerPct: number;
}

export interface PriceCalculatorState extends PriceCalculatorConfig {
  result: PriceCalculatorResult;
}

/**
 * A fórmula do protótipo (l.6717–6729), em centavos e basis points.
 *
 * O `divisor` tem piso de 5% como no desenho: comissão + margem somando ≥ 95%
 * levaria o preço mínimo ao infinito e a tela mostraria `R$ Infinity`. O piso
 * devolve um número absurdo mas finito — que é a resposta honesta para
 * "quero 60% de margem pagando 45% de comissão".
 */
export function computePriceCalculator(config: PriceCalculatorConfig): PriceCalculatorResult {
  const custosFixosTotalCents = config.fixedCosts.reduce(
    (sum, cost) => sum + Math.max(0, cost.amountCents),
    0,
  );
  const atendimentos = Math.max(1, config.atendimentosMes);

  const custoFixoRateadoCents = Math.round(custosFixosTotalCents / atendimentos);
  const custoPorAtendimentoCents = custoFixoRateadoCents + config.custoVariavelCents;

  const comissaoFrac = config.comissaoMediaBps / 10_000;
  const margemFrac = config.margemBps / 10_000;
  const divisor = Math.max(0.05, 1 - comissaoFrac - margemFrac);
  const precoMinimoCents = Math.round(custoPorAtendimentoCents / divisor);

  const contribuicaoMarginalCents = Math.round(
    config.precoPraticadoCents * (1 - comissaoFrac) - config.custoVariavelCents,
  );
  const pontoEquilibrio =
    contribuicaoMarginalCents > 0
      ? Math.ceil(custosFixosTotalCents / contribuicaoMarginalCents)
      : null;
  const lucroLiquidoCents = contribuicaoMarginalCents * atendimentos - custosFixosTotalCents;

  const barMax = Math.max(pontoEquilibrio ?? 0, atendimentos) * 1.15 || 1;

  return {
    custosFixosTotalCents,
    custoFixoRateadoCents,
    custoPorAtendimentoCents,
    precoMinimoCents,
    contribuicaoMarginalCents,
    pontoEquilibrio,
    lucroLiquidoCents,
    breakEvenBarPct: pontoEquilibrio != null ? Math.min(100, (pontoEquilibrio / barMax) * 100) : 0,
    estimadosMarkerPct: Math.min(100, (atendimentos / barMax) * 100),
  };
}

/** Corpo do `PUT /price-calculator`. */
export interface UpdatePriceCalculatorDto {
  fixedCosts: Array<{ name: string; amountCents: number }>;
  custoVariavelCents: number;
  comissaoMediaBps: number;
  atendimentosMes: number;
  margemBps: number;
  precoPraticadoCents: number;
}
