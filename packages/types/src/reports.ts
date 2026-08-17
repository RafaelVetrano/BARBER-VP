/** Relatórios — fase 07. Endpoints agregados em SQL, nunca N+1. */

export interface ReportPeriodQuery {
  /** `YYYY-MM-DD`. Omitidos = últimos 30 dias. */
  from?: string;
  to?: string;
  barberIds?: string[];
  unitId?: string;
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

export interface RevenueByDay {
  /** `YYYY-MM-DD`. */
  date: string;
  revenueCents: number;
}

export interface PaymentDistributionEntry {
  method: string;
  amountCents: number;
  count: number;
}

export interface ReturnRateBucket {
  /** ex.: "0-15 dias", "16-30 dias", "31-60 dias", "60+ dias". */
  label: string;
  clients: number;
}

/** Básico — liberado em todo plano. */
export interface ReportsSummaryResponse {
  period: { from: string; to: string };
  revenueCents: number;
  orders: number;
  averageTicketCents: number;
  paymentDistribution: PaymentDistributionEntry[];
}

/** Atrás de `relatoriosAvancados` (Profissional+). */
export interface ReportsAdvancedResponse {
  period: { from: string; to: string };
  occupancyRate: number;
  noShowRate: number;
  revenueByBarber: RevenueByBarber[];
  revenueByService: RevenueByService[];
  revenueByDay: RevenueByDay[];
  returnRate: ReturnRateBucket[];
}
