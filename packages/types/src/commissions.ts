/** Comissões e vales — fase 07, reconstruído na auditoria da aba (agente 19). */

import type { CommissionRuleType } from './enums';

export interface CommissionTierDto {
  /** `null` na última faixa (acima de tudo). */
  upToCents: number | null;
  percentBps: number;
}

export interface CommissionRuleItem {
  id: string;
  name: string;
  type: CommissionRuleType;
  /** Só para `FIXED` — percentual sobre SERVIÇOS. */
  percentBps: number | null;
  tiers: CommissionTierDto[];
  /**
   * Percentual sobre PRODUTOS. Vale para os dois tipos de regra — o modal de
   * faixas do protótipo tem "% produtos (todas as faixas)", ou seja, produto
   * nunca entra na progressão por faturamento.
   */
  percentProdutosBps: number;
  /** "Descontar vales automaticamente" do modal de regras. */
  deductVales: boolean;
  active: boolean;
  barberIds: string[];
}

export interface UpsertCommissionRuleDto {
  name: string;
  type: CommissionRuleType;
  percentBps?: number | null;
  tiers?: CommissionTierDto[];
  percentProdutosBps?: number;
  deductVales?: boolean;
  barberIds?: string[];
}

/** O que gerou o lançamento — serviço entra na faixa, produto não. */
export type CommissionEntryKind = 'SERVICE' | 'PRODUCT';

export interface CommissionExtractEntry {
  /** Fechamento da comanda (ISO). */
  date: string;
  clientName: string;
  /** Nome do serviço ou do produto. */
  itemName: string;
  kind: CommissionEntryKind;
  /** Valor faturado do item — a base de cálculo. */
  baseCents: number;
  /** Taxa aplicada a ESTE lançamento (4000 = 40%). */
  percentBps: number;
  commissionCents: number;
}

export interface CommissionBarberSummary {
  barberId: string;
  barberName: string;
  ruleId: string | null;
  ruleName: string | null;
  ruleType: CommissionRuleType | null;
  /** Taxa efetivamente aplicada no período (faixa escolhida, ou o % fixo). */
  appliedPercentBps: number | null;
  ruleProdutosPercentBps: number;
  /** `false` deixa o vale à vista na tabela sem abatê-lo do total. */
  deductVales: boolean;
  faturadoServicosCents: number;
  faturadoProdutosCents: number;
  comissaoServicosCents: number;
  comissaoProdutosCents: number;
  /** Serviços + produtos, antes do vale. */
  comissaoCents: number;
  valeCents: number;
  /** O que o barbeiro recebe — já com o vale abatido quando a regra manda. */
  totalCents: number;
  atendimentos: number;
  status: 'PENDING' | 'PAID';
  extrato: CommissionExtractEntry[];
}

/** Recorte exibido — "Semanal"/"Mensal" do protótipo. */
export type CommissionPeriodType = 'WEEKLY' | 'MONTHLY';

export interface CommissionPeriodQuery {
  /** Padrão `MONTHLY`. */
  type?: CommissionPeriodType;
  /** Qualquer dia DENTRO do período (`YYYY-MM-DD`). Padrão: hoje. */
  anchor?: string;
  /** Atalho de `type=MONTHLY` (`YYYY-MM`) — mantido para compatibilidade. */
  month?: string;
}

export interface CommissionPeriodResponse {
  type: CommissionPeriodType;
  /**
   * Competência (`YYYY-MM`) — é ela que "Fechar período" trava, mesmo no
   * recorte semanal: a faixa da regra é calculada sobre o faturamento do MÊS.
   */
  month: string;
  /** Primeiro e último dia do recorte exibido (`YYYY-MM-DD`, inclusivos). */
  start: string;
  end: string;
  closed: boolean;
  /** Soma dos `totalCents` — o KPI "Total a pagar". */
  totalAPagarCents: number;
  /** `true` quando quem pediu é `BARBER` (só a própria linha, sem totais da casa). */
  scoped: boolean;
  barbers: CommissionBarberSummary[];
}

export interface ClosePeriodDto {
  month: string;
}

/** Query do relatório em PDF de UM barbeiro (`modalPdfOpen` do protótipo). */
export interface CommissionReportQuery extends CommissionPeriodQuery {
  barberId: string;
}

// ── Vales ────────────────────────────────────────────────────────────────

export interface ValeItem {
  id: string;
  barberId: string;
  barberName: string;
  amountCents: number;
  /** `YYYY-MM-DD` — o dia do adiantamento (coluna "Data" da aba Vales). */
  date: string;
  /** `YYYY-MM` — a competência que a comissão desconta. */
  referenceMonth: string;
  description: string | null;
  settled: boolean;
}

export interface CreateValeDto {
  barberId: string;
  amountCents: number;
  /** `YYYY-MM-DD` — o dia do adiantamento; o mês de competência é derivado dele. */
  date: string;
  description?: string | null;
}
