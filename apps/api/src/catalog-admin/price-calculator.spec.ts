import { computePriceCalculator, type PriceCalculatorConfig } from '@barbervp/types';

/**
 * A fórmula da calculadora de preço (`Dashboard.dc.html` l.6717–6729).
 *
 * Vale um teste unitário próprio porque a MESMA função roda nos dois lados: o
 * servidor grava com ela e a página redesenha com ela a cada movimento de
 * slider. Uma divergência aqui aparece como "o número mudou depois que eu
 * salvei" — o tipo de bug que ninguém reporta e todo mundo desconfia.
 */
describe('computePriceCalculator', () => {
  const base: PriceCalculatorConfig = {
    fixedCosts: [
      { id: '1', name: 'Aluguel', amountCents: 250_000 },
      { id: '2', name: 'Energia', amountCents: 45_000 },
    ],
    custoVariavelCents: 450,
    comissaoMediaBps: 4_500,
    atendimentosMes: 480,
    margemBps: 2_000,
    precoPraticadoCents: 4_500,
  };

  it('rateia o custo fixo pelos atendimentos e soma o variável', () => {
    const result = computePriceCalculator(base);

    expect(result.custosFixosTotalCents).toBe(295_000);
    // 295000 / 480 = 614,58… → 615
    expect(result.custoFixoRateadoCents).toBe(615);
    expect(result.custoPorAtendimentoCents).toBe(615 + 450);
  });

  it('o preço mínimo cobre custo, comissão e margem', () => {
    const result = computePriceCalculator(base);

    // 1065 / (1 - 0,45 - 0,20) = 1065 / 0,35 = 3042,857… → 3043
    expect(result.precoMinimoCents).toBe(3_043);
  });

  it('comissão + margem acima de 95% cai no piso do divisor, sem estourar em Infinity', () => {
    const result = computePriceCalculator({
      ...base,
      comissaoMediaBps: 6_000,
      margemBps: 6_000,
    });

    expect(Number.isFinite(result.precoMinimoCents)).toBe(true);
    // Piso de 0,05 do protótipo: 1065 / 0,05 = 21 300.
    expect(result.precoMinimoCents).toBe(21_300);
  });

  it('preço que não cobre comissão + insumo não tem ponto de equilíbrio', () => {
    const result = computePriceCalculator({
      ...base,
      custoVariavelCents: 5_000,
      comissaoMediaBps: 5_000,
      precoPraticadoCents: 2_000,
    });

    expect(result.contribuicaoMarginalCents).toBeLessThan(0);
    expect(result.pontoEquilibrio).toBeNull();
    expect(result.breakEvenBarPct).toBe(0);
    expect(result.lucroLiquidoCents).toBeLessThan(0);
  });

  it('lucro e ponto de equilíbrio saem da contribuição marginal', () => {
    const result = computePriceCalculator(base);

    // 4500 * 0,55 - 450 = 2025
    expect(result.contribuicaoMarginalCents).toBe(2_025);
    // ceil(295000 / 2025) = 146
    expect(result.pontoEquilibrio).toBe(146);
    // 2025 * 480 - 295000 = 677 000
    expect(result.lucroLiquidoCents).toBe(677_000);
  });

  it('barbearia sem custo fixo nenhum não divide por zero', () => {
    const result = computePriceCalculator({ ...base, fixedCosts: [] });

    expect(result.custoFixoRateadoCents).toBe(0);
    expect(result.pontoEquilibrio).toBe(0);
    expect(result.estimadosMarkerPct).toBeLessThanOrEqual(100);
  });

  it('atendimentos zerados não viram divisão por zero (piso de 1)', () => {
    const result = computePriceCalculator({ ...base, atendimentosMes: 0 });

    expect(Number.isFinite(result.custoFixoRateadoCents)).toBe(true);
    expect(result.custoFixoRateadoCents).toBe(295_000);
  });
});
