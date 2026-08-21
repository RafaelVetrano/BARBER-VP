/**
 * Contratos da tela **Dashboard** (`/app`) — `Dashboard.dc.html`, linhas 60–400.
 *
 * Uma chamada (`GET /dashboard/overview`) entrega a página inteira, e uma
 * segunda (`GET /dashboard/shell`) entrega a casca (topbar + rodapé da
 * sidebar), que é a MESMA em todas as 14 telas do painel — por isso mora fora
 * do `overview`, senão cada tela pagaria a agregação do dashboard só para
 * saber o nome do plano.
 *
 * Convenção do projeto: dinheiro SEMPRE em centavos (`...Cents`). O protótipo
 * fala em `revenueToday`; aqui é `revenueTodayCents`, pelo mesmo motivo que o
 * resto da API — nenhum float atravessa a fronteira.
 */

import type { AppointmentStatus, Role } from './enums';
import type { FeatureKey, PlanFeatures } from './features';

/** Dias de teste do tenant novo, contados a partir de `Tenant.createdAt`. */
export const TRIAL_PERIOD_DAYS = 14;

/** Pontos de cada mini-gráfico dos KPIs (8 no protótipo). */
export const SPARKLINE_POINTS = 8;

// ── Casca (topbar + rodapé da sidebar) ───────────────────────────────────

export interface DashboardShellPlan {
  /** `essencial` | `profissional` | `avancado`. */
  code: string;
  name: string;
  priceCents: number;
  tier: number;
  /** `true` no plano de maior tier ativo — o botão vira "Plano máximo ativo". */
  isMaxTier: boolean;
}

export interface DashboardShellUnit {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface DashboardShellTrial {
  daysLeft: number;
  /** Percentual do período de teste já consumido (0–100), para a barra. */
  progressPct: number;
}

export interface DashboardShellResponse {
  tenant: { id: string; name: string; slug: string; status: string; timezone: string };
  role: Role;
  /** `null` enquanto o tenant está em teste e não contratou plano nenhum. */
  plan: DashboardShellPlan | null;
  /** Espelho EXATO do que o `FeatureGuard` decide — sem plano, tudo `false`. */
  features: PlanFeatures;
  /** `null` quando o tenant não está mais em teste. */
  trial: DashboardShellTrial | null;
  /** Unidades visíveis. Vazio quando o plano não tem `multiUnidades`. */
  units: DashboardShellUnit[];
}

// ── KPIs ─────────────────────────────────────────────────────────────────

export interface DashboardAppointmentsToday {
  total: number;
  confirmed: number;
  pending: number;
  done: number;
}

/**
 * Séries e variações.
 *
 * `...DeltaPct` é `null` — não `0` — quando não há base de comparação (ontem
 * sem faturamento, mês anterior sem comanda). Zero significaria "não mudou",
 * que é uma afirmação diferente de "não dá para dizer".
 */
export interface DashboardKpis {
  revenueTodayCents: number;
  revenueDeltaPct: number | null;
  /** Faturamento dos últimos 8 dias, em centavos, terminando hoje. */
  revenueSparkline: number[];

  appointmentsToday: DashboardAppointmentsToday;

  /** Ocupação da agenda de HOJE, 0–100. */
  occupancyPct: number;

  avgTicketCents: number;
  avgTicketDeltaPct: number | null;
  /** Ticket médio dos últimos 8 meses, em centavos, terminando no mês atual. */
  avgTicketSparkline: number[];

  newClients: number;
  newClientsDeltaPct: number | null;
  newClientsSparkline: number[];

  noShows: number;
  noShowsDeltaPct: number | null;
  noShowsSparkline: number[];
}

// ── Gráfico de faturamento ───────────────────────────────────────────────

export const DASHBOARD_PERIODS = ['dia', 'semana', 'mes'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export interface DashboardRevenuePoint {
  /** `09h` no período dia, `Seg` na semana, `17/08` no mês. */
  label: string;
  valueCents: number;
}

export interface DashboardRevenueChart {
  period: DashboardPeriod;
  points: DashboardRevenuePoint[];
  /**
   * Meta mensal (`TenantSettings.monthlyGoalCents`). `null` quando a barbearia
   * não definiu meta — a linha tracejada simplesmente não é desenhada.
   */
  goalCents: number | null;
  /**
   * A mesma meta rateada pelo tamanho do balde do período ativo — é ONDE a
   * linha tracejada é desenhada. O protótipo dividia a meta por 30 fosse qual
   * fosse o recorte, o que colocava a linha no lugar errado nos modos Dia e
   * Semana.
   */
  goalPerPointCents: number | null;
}

// ── Blocos ───────────────────────────────────────────────────────────────

export interface DashboardTopService {
  serviceId: string | null;
  name: string;
  /** Participação no faturamento do mês, 0–100. */
  pct: number;
  revenueCents: number;
}

export interface DashboardBarberRankItem {
  id: string;
  name: string;
  initials: string;
  count: number;
  revenueCents: number;
}

export interface DashboardUpcomingAppointment {
  id: string;
  /** `HH:mm` já no fuso do tenant. */
  time: string;
  clientName: string;
  serviceName: string;
  barberName: string;
  status: AppointmentStatus;
}

/**
 * Alertas acionáveis. Cada campo só vira card quando a condição é verdadeira —
 * contagem zero (ou `null`) não renderiza nada.
 */
export interface DashboardAlerts {
  /** Clientes sem visita há 30+ dias. */
  inactiveClients: number;
  /**
   * Contas a pagar vencendo nos próximos 7 dias. `null` quando o plano não tem
   * `contasPagarReceber` — o botão levaria a uma tela que devolve 403.
   */
  dueBills: { count: number; totalCents: number } | null;
  /** `null` para quem não administra o caixa (papel `BARBER`). */
  cashRegisterOpen: boolean | null;
  /** Clientes que fazem aniversário nos próximos 7 dias. */
  birthdays: number;
}

/** Recorte dos números: a barbearia inteira, ou só o barbeiro logado. */
export type DashboardScope = 'TENANT' | 'BARBER';

export interface DashboardOverviewResponse {
  period: DashboardPeriod;
  timezone: string;
  scope: DashboardScope;
  kpis: DashboardKpis;
  revenueChart: DashboardRevenueChart;
  topServices: DashboardTopService[];
  barberRanking: DashboardBarberRankItem[];
  upcomingAppointments: DashboardUpcomingAppointment[];
  alerts: DashboardAlerts;
  /**
   * Blocos suprimidos pelo plano, com a feature que os liberaria — o front
   * troca o conteúdo por upsell em vez de mostrar caixa vazia mentindo que
   * não há dado.
   */
  lockedByPlan: FeatureKey[];
}

// ── Busca global (Ctrl+K) ────────────────────────────────────────────────

export interface GlobalSearchClient {
  id: string;
  name: string;
  phone: string;
}

export interface GlobalSearchAppointment {
  id: string;
  clientName: string;
  serviceName: string;
  barberName: string;
  /** ISO — o front formata no fuso do tenant. */
  startsAt: string;
  status: AppointmentStatus;
}

export interface GlobalSearchService {
  id: string;
  name: string;
  priceCents: number;
  durationMin: number;
}

export interface GlobalSearchResponse {
  query: string;
  clients: GlobalSearchClient[];
  appointments: GlobalSearchAppointment[];
  services: GlobalSearchService[];
  total: number;
}

// ── Sino de notificações ─────────────────────────────────────────────────

export const NOTIFICATION_KINDS = [
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_CANCELED',
  'BILL_DUE',
  'CASH_REGISTER_CLOSED',
  'LOW_STOCK',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  text: string;
  /** ISO do fato que originou o aviso. */
  createdAt: string;
  /** Rota do painel para onde o item leva. */
  href: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  count: number;
}
