/**
 * Relatórios — aba `isRelatorios` do painel (`Dashboard.dc.html` l.1229–1496)
 * e a versão restrita do barbeiro (`DashboardFuncionario.dc.html` l.667–775).
 *
 * A divisão entre `summary` e `advanced` é a do PROTÓTIPO, não uma escolha de
 * arquitetura: o que aparece sem cadeado na tela mora em `summary` (todo
 * plano), o que aparece embaçado atrás de "Disponível no plano Profissional"
 * mora em `advanced` (atrás de `relatoriosAvancados`). Mover um bloco de lado
 * muda o que o Essencial vê — conferir a tela antes.
 */

/** As 5 pílulas de período do protótipo (`PERIODS`, l.6786). */
export const REPORT_PERIOD_KEYS = ['hoje', '7d', '30d', 'mes', 'custom'] as const;
export type ReportPeriodKey = (typeof REPORT_PERIOD_KEYS)[number];

export const REPORT_PERIOD_LABEL: Record<ReportPeriodKey, string> = {
  hoje: 'Hoje',
  '7d': '7 dias',
  '30d': '30 dias',
  mes: 'Este mês',
  custom: 'Personalizado',
};

export interface ReportPeriodQuery {
  /** Padrão `30d`. `custom` exige `from`/`to`. */
  period?: ReportPeriodKey;
  /** `YYYY-MM-DD` no fuso da barbearia — só lido quando `period=custom`. */
  from?: string;
  to?: string;
  /** Vazio = todos os barbeiros. `BARBER` é forçado ao próprio id. */
  barberIds?: string[];
  /** Vazio = todas as unidades. */
  unitId?: string;
}

/** O recorte que o servidor REALMENTE usou — a tela rotula por ele. */
export interface ReportResolvedPeriod {
  key: ReportPeriodKey;
  /** `YYYY-MM-DD` locais, ambos INCLUSIVOS. */
  from: string;
  to: string;
}

/** Ponto da série de faturamento — `label` já vem pronto para o eixo X. */
export interface ReportRevenuePoint {
  label: string;
  revenueCents: number;
}

export interface RevenueByBarber {
  barberId: string;
  barberName: string;
  revenueCents: number;
  orders: number;
}

export interface RevenueByService {
  serviceId: string;
  serviceName: string;
  revenueCents: number;
  count: number;
}

export interface PaymentDistributionEntry {
  method: string;
  amountCents: number;
  count: number;
  /** 0–100, arredondado. É o `{{ l.pctLabel }}` da legenda da rosca. */
  pct: number;
}

/**
 * Básico — liberado em TODO plano, porque nenhum destes blocos tem cadeado no
 * protótipo (faturamento por período, por barbeiro e por forma de pagamento).
 */
export interface ReportsSummaryResponse {
  period: ReportResolvedPeriod;
  /** `true` quando o papel é `BARBER` e a resposta traz só os números dele. */
  scoped: boolean;
  revenueCents: number;
  /** Mesmo número de dias imediatamente ANTES de `from` — a base do delta. */
  previousRevenueCents: number;
  /** `null` quando o período anterior faturou zero: "não dá para comparar". */
  deltaPct: number | null;
  /**
   * ATENDIMENTOS concluídos no período — não "comandas fechadas".
   *
   * Desde o agente 31 concluir um atendimento e cobrar por ele são ações
   * separadas, então a conta soma as comandas fechadas MAIS os agendamentos
   * `DONE` que não geraram comanda nenhuma. Contar só a comanda faria o
   * atendimento concluído e não cobrado sumir do relatório — ele aconteceu,
   * com faturamento zero.
   */
  orders: number;
  averageTicketCents: number;
  revenueSeries: ReportRevenuePoint[];
  revenueByBarber: RevenueByBarber[];
  paymentDistribution: PaymentDistributionEntry[];
  /** O recorte das comandas fechadas sem cobrar (agente 31). */
  courtesies: CourtesySummary;
}

/**
 * Cortesias do período: quantas foram e o que teriam valido a preço de tabela.
 *
 * Fica fora do `paymentDistribution` de propósito — aquele bloco reparte o
 * FATURAMENTO, e cortesia é R$ 0. Uma fatia de 0% ali seria ruído; aqui é a
 * informação que o dono procura (quanto a casa deu de graça no mês).
 */
export interface CourtesySummary {
  count: number;
  /** Soma dos itens ao preço de tabela do catálogo. */
  listPriceCents: number;
}

export interface ReturnRateBucket {
  /** "0–15 dias", "16–30 dias", "31–45 dias", "46+ dias / não voltou". */
  label: string;
  clients: number;
  /** 0–100, arredondado. */
  pct: number;
}

/** "62% dos clientes voltam em até 45 dias" + as 4 faixas embaixo. */
export interface ReturnRate {
  clients: number;
  /** O "45" da frase — soma das faixas até esse corte. */
  withinDays: number;
  headlinePct: number;
  buckets: ReturnRateBucket[];
}

export interface HeatmapCell {
  hour: number;
  appointments: number;
  /** 0–1, relativo à célula mais cheia do mapa. */
  intensity: number;
}

export interface HeatmapRow {
  /** "Seg" … "Dom". */
  day: string;
  weekday: number;
  cells: HeatmapCell[];
}

export interface ReportsHeatmap {
  /** As 14 horas do protótipo: 8…21. */
  hours: number[];
  rows: HeatmapRow[];
  /** "sábado, 10h–13h" — `null` quando não houve atendimento no período. */
  peakLabel: string | null;
}

export interface NoShowMonthPoint {
  /** `YYYY-MM`. */
  month: string;
  /** "Jan", "Fev"… */
  label: string;
  appointments: number;
  noShows: number;
  /** 0–100, arredondado. */
  pct: number;
}

export interface NoShowTrend {
  /** Os 8 meses que terminam no mês final do período. */
  points: NoShowMonthPoint[];
  /**
   * Índice do mês em que o lembrete de WhatsApp foi ligado
   * (`WhatsappAutomationConfig.enabledAt`) — `null` quando nunca foi ligado ou
   * quando isso caiu fora da janela. É a linha tracejada do protótipo.
   */
  whatsappActivatedIndex: number | null;
}

export interface TicketByBarber {
  barberId: string;
  barberName: string;
  /** Comandas fechadas — o denominador do ticket, igual ao resto do produto. */
  orders: number;
  ticketCents: number;
}

/** Atrás de `relatoriosAvancados` (Profissional+) — os 5 blocos com cadeado. */
export interface ReportsAdvancedResponse {
  period: ReportResolvedPeriod;
  scoped: boolean;
  revenueByService: RevenueByService[];
  returnRate: ReturnRate;
  heatmap: ReportsHeatmap;
  noShowTrend: NoShowTrend;
  ticketByBarber: TicketByBarber[];
}
