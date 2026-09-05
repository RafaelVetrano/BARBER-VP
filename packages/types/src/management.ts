/**
 * Contratos da operação diária do dashboard (fase 06) — Clientes, Serviços &
 * Produtos, Equipe (barbeiros, escala, convites) e Agenda interna.
 *
 * Mesma regra das demais famílias: o que a API devolve e o frontend consome é
 * definido aqui uma vez só, para as duas pontas não divergirem.
 */

import type {
  AppointmentOrigin,
  AppointmentStatus,
  MembershipRole,
  OrderStatus,
  PaymentMethod,
  ScheduleExceptionType,
  StaffInviteStatus,
  SubscriptionStatus,
} from './enums';
import type { Paginated, PaginationQuery } from './http';
import type { SlotPeriod } from './booking';

// ── Clientes ─────────────────────────────────────────────────────────────

/**
 * Situação do cliente NESTA barbearia — a coluna "Status" e os chips de filtro
 * da aba Clientes (`Dashboard.dc.html` l.579, l.596).
 *
 * É derivada, nunca gravada: um campo persistido envelheceria sozinho (quem
 * marcaria "Inativo" no trigésimo primeiro dia?). A ordem abaixo é a de
 * precedência — um mensalista bloqueado aparece como `BLOQUEADO`, porque é
 * isso que muda o que a recepção pode fazer com ele.
 */
export const ClientStatus = {
  BLOQUEADO: 'BLOQUEADO',
  MENSALISTA: 'MENSALISTA',
  INATIVO: 'INATIVO',
  ATIVO: 'ATIVO',
} as const;
export type ClientStatus = (typeof ClientStatus)[keyof typeof ClientStatus];

/** Dias sem visita a partir dos quais o cliente conta como inativo. */
export const CLIENT_INACTIVE_DAYS = 30;

export interface ClientListItem {
  /** Id do `ClientProfile` — o registro por barbearia. */
  id: string;
  /** Id do `Client` global (identidade única na plataforma). */
  clientId: string;
  name: string;
  /** E.164 sem formatação. */
  phone: string;
  email: string | null;
  /** `YYYY-MM-DD`, `null` quando não informado. */
  birthDate: string | null;
  notes: string | null;
  favoriteBarberId: string | null;
  favoriteBarberName: string | null;
  noShowCount: number;
  blocked: boolean;
  visitCount: number;
  totalSpentCents: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  createdAt: string;
  status: ClientStatus;
  /**
   * Saldo de fidelidade. `null` — e não `0` — quando a barbearia não tem
   * programa de pontos ligado: "não pontua" e "pontuou zero" são coisas
   * diferentes, e a coluna pinta as duas diferente (regra 2 da fase 13).
   */
  loyaltyPoints: number | null;
  /** `Client.notifyWhatsapp` — o toggle "Aceita receber mensagens". */
  acceptsMessages: boolean;
}

/** Contagem por chip de filtro — disjunta, soma exatamente `all`. */
export interface ClientListCounts {
  all: number;
  ativo: number;
  inativo: number;
  mensalista: number;
  bloqueado: number;
}

export type ClientListSort = 'name' | 'lastVisitAt' | 'visitCount' | 'createdAt';

export interface ClientListQuery extends PaginationQuery {
  search?: string;
  favoriteBarberId?: string;
  blocked?: boolean;
  status?: ClientStatus;
  sort?: ClientListSort;
  order?: 'asc' | 'desc';
}

/**
 * `counts` vem junto da página porque os chips de filtro do protótipo mostram
 * o número ao lado do rótulo: uma segunda chamada só para isso deixaria chip e
 * tabela discordando entre si durante a digitação da busca.
 *
 * As contagens respeitam a BUSCA e ignoram o status escolhido — senão o chip
 * ativo seria o único diferente de zero.
 */
export type ClientListResponse = Paginated<ClientListItem> & { counts: ClientListCounts };

/**
 * Cadastro rápido do balcão — o "＋ Cadastrar novo cliente" do modal de
 * agendamento. Só nome e WhatsApp: o resto da ficha é preenchido na aba
 * Clientes, e exigir mais aqui travaria a fila do balcão.
 */
export interface CreateClientDto {
  name: string;
  phone: string;
  /** Campos do modal "Novo cliente" da aba Clientes (`Dashboard.dc.html` l.3080). */
  email?: string | null;
  /** `YYYY-MM-DD`. */
  birthDate?: string | null;
  notes?: string | null;
  acceptsMessages?: boolean;
}

export interface UpdateClientProfileDto {
  notes?: string | null;
  favoriteBarberId?: string | null;
}

// ── Perfil do cliente (drawer da aba Clientes) ───────────────────────────

/** Uma linha do "Histórico" — uma comanda fechada deste cliente. */
export interface ClientHistoryEntry {
  orderId: string;
  /** ISO do fechamento da comanda. */
  date: string;
  totalCents: number;
  /** Descrição dos itens, na ordem em que entraram na comanda. */
  items: string[];
  barberName: string | null;
  /** Vazio quando a comanda fechou sem pagamento registrado (R$ 0). */
  paymentMethods: PaymentMethod[];
}

/** Uma linha do extrato de pontos. */
export interface ClientLoyaltyEntry {
  id: string;
  date: string;
  description: string;
  /** Positivo em ganho/ajuste, negativo em resgate/expiração. */
  points: number;
}

/** Quota de um serviço dentro do ciclo corrente da assinatura. */
export interface ClientSubscriptionUsage {
  serviceName: string;
  used: number;
  quota: number;
}

export interface ClientSubscriptionSummary {
  id: string;
  planName: string;
  priceCents: number;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextChargeAt: string | null;
  usages: ClientSubscriptionUsage[];
  /** Soma de `usages` — o "Usos neste ciclo: 3/4" do protótipo. */
  usedTotal: number;
  quotaTotal: number;
}

export interface ClientDetail extends ClientListItem {
  /** `totalSpentCents / visitCount`, arredondado. `0` sem visitas. */
  ticketAverageCents: number;
  /** `false` quando a barbearia não tem programa de pontos ligado. */
  loyaltyEnabled: boolean;
  history: ClientHistoryEntry[];
  loyaltyLedger: ClientLoyaltyEntry[];
  /** `null` = "Sem assinatura ativa" (l.3062). */
  subscription: ClientSubscriptionSummary | null;
}

// ── Ações em lote (barra de seleção, `Dashboard.dc.html` l.2988) ─────────

export interface ClientBulkBlockDto {
  /** Ids de `ClientProfile`. */
  ids: string[];
  blocked: boolean;
}

export interface ClientBulkBlockResult {
  updated: number;
}

export interface ClientBulkMessageDto {
  ids: string[];
  body: string;
}

export interface ClientBulkMessageResult {
  queued: number;
  /** Recusaram receber mensagens (`Client.notifyWhatsapp = false`). */
  skipped: number;
}

// ── Catálogo — Serviços ──────────────────────────────────────────────────

/** As 6 cores da bolinha de agenda (`SP_COLORS`, protótipo l.4375). */
export const SERVICE_COLORS = [
  '#D4A84C',
  '#5B8DE0',
  '#3FB68B',
  '#E8A13C',
  '#9B6BD4',
  '#E05B5B',
] as const;

export interface ServiceListItem {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  category: string | null;
  /** Bolinha da agenda e da tabela. `null` = sem cor escolhida. */
  color: string | null;
  /**
   * Override de comissão DESTE serviço, em basis points. `null` = usa a regra
   * do barbeiro — é o estado desligado do toggle "Comissão específica".
   */
  commissionBps: number | null;
  /**
   * O que a coluna "Comissão padrão" mostra: o override, quando existe, ou a
   * regra padrão da barbearia. Resolvido no servidor — a tabela nunca refaz
   * a conta de comissão por conta própria.
   */
  effectiveCommissionBps: number;
  isCombo: boolean;
  active: boolean;
  sortOrder: number;
  barberIds: string[];
}

export interface ServiceListQuery extends PaginationQuery {
  search?: string;
  category?: string;
  active?: boolean;
}

/**
 * A lista de serviços carrega o padrão da casa junto: o modal precisa dele
 * para mostrar de quanto é a comissão que o serviço herda quando o toggle
 * está desligado, sem uma segunda chamada só para isso.
 */
export interface ServiceListResponse extends Paginated<ServiceListItem> {
  /** `CommissionRule.percentBps` da regra padrão ativa; 0 se não houver regra. */
  defaultCommissionBps: number;
}

export interface UpsertServiceDto {
  name: string;
  description?: string | null;
  durationMin: number;
  priceCents: number;
  category?: string | null;
  color?: string | null;
  commissionBps?: number | null;
  active?: boolean;
  barberIds?: string[];
}

// ── Catálogo — Produtos ──────────────────────────────────────────────────

export interface ProductListItem {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  priceCents: number;
  costCents: number | null;
  stock: number;
  estoqueMin: number;
  active: boolean;
  /** `stock <= estoqueMin` — acende o selo "Repor" e o alerta do sino. */
  lowStock: boolean;
  /**
   * Margem sobre o custo, em basis points (`(venda - custo) / custo`).
   * `null` quando não há custo cadastrado: dividir por zero na tela daria
   * "Infinity%", e um produto sem custo simplesmente não tem margem conhecida.
   */
  marginBps: number | null;
}

export interface ProductListQuery extends PaginationQuery {
  search?: string;
  category?: string;
  active?: boolean;
  lowStock?: boolean;
}
export type ProductListResponse = Paginated<ProductListItem>;

export interface UpsertProductDto {
  name: string;
  sku?: string | null;
  description?: string | null;
  category?: string | null;
  priceCents: number;
  costCents?: number | null;
  stock?: number;
  estoqueMin?: number;
  active?: boolean;
}

/** "Repor estoque" do kebab de produto (protótipo l.1818). */
export interface RestockProductDto {
  /** Unidades a somar ao estoque atual. */
  quantity: number;
}

// ── Equipe — Barbeiros ───────────────────────────────────────────────────

export interface WorkScheduleDay {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  /** Minutos desde a meia-noite. */
  startTime: number;
  endTime: number;
  lunchStart: number | null;
  lunchEnd: number | null;
  isDayOff: boolean;
}

export interface BarberListItem {
  id: string;
  name: string;
  specialty: string | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  /**
   * Desligado pelo DOWNGRADE de plano, não pelo dono (`inactiveByPlan` só é
   * `true` com `active === false`). O card mostra "Inativo pelo plano" e o
   * upgrade reativa sozinho — reativar na mão bate no 403 do limite.
   */
  inactiveByPlan: boolean;
  /** É o barbeiro-dono, criado automaticamente no registro — não removível. */
  isOwner: boolean;
  /** Tem `User` próprio (login em `DashboardFuncionario`). */
  hasLogin: boolean;
  serviceIds: string[];
  /** Nomes na mesma ordem de `serviceIds` — as pílulas do card (l.2065). */
  serviceNames: string[];
  /** `CommissionRule` do barbeiro, quando tem uma. */
  commissionRuleId: string | null;
  /**
   * A comissão já resolvida para o card ("40%" ou "Por faixas"). `null` quando
   * o barbeiro não tem regra — a tela escreve "Sem regra", e não um 0% que
   * seria mentira.
   */
  commissionLabel: string | null;
  workSchedule: WorkScheduleDay[];
}

export interface UpdateBarberDto {
  name?: string;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  /*
   * `avatarUrl` NÃO entra aqui (agente 29): a foto sobe por
   * `POST /barbers/:id/avatar`, que valida tipo e tamanho pelo
   * `StorageAdapter`. Aceitá-la também neste `PATCH` seria um segundo caminho
   * de escrita para a mesma coluna, esse sem validação nenhuma — e os dois
   * acabariam divergindo.
   */
  active?: boolean;
  serviceIds?: string[];
  /** A semana inteira, salva junto com o resto do modal (l.2216). */
  schedule?: WorkScheduleDay[];
}

/**
 * O cabeçalho "Barbeiros: X de Y" com a barra de uso (l.2043) e o banner de
 * downgrade (l.2025) — os dois saem daqui, nunca de contagem feita na tela.
 */
export interface TeamPlanUsage {
  /** Barbeiros ativos hoje. */
  activeBarbers: number;
  /** Convites `PENDING` — CONTAM no teto desde a criação. */
  pendingInvites: number;
  /** `null` = plano ilimitado, ou tenant ainda em teste (sem plano). */
  maxBarbers: number | null;
  planName: string | null;
  /** `false` quando `activeBarbers + pendingInvites` já encostou no teto. */
  canAddBarber: boolean;
  /** Nomes dos desligados pelo downgrade — o banner cita cada um. */
  inactiveByPlanNames: string[];
}

/** Barbeiro adicionado direto pelo dono/gerente, sem convite por e-mail (sem login próprio). */
export interface CreateBarberDto {
  name: string;
  specialty?: string | null;
  phone?: string | null;
  serviceIds?: string[];
}

export interface UpdateWorkScheduleDto {
  days: WorkScheduleDay[];
}

export interface ScheduleExceptionItem {
  id: string;
  /** `null` = vale para a barbearia inteira (feriado). */
  barberId: string | null;
  startDate: string;
  endDate: string;
  type: ScheduleExceptionType;
  startTime: number | null;
  endTime: number | null;
  reason: string | null;
}

export interface CreateScheduleExceptionDto {
  barberId?: string | null;
  startDate: string;
  endDate: string;
  type: ScheduleExceptionType;
  startTime?: number | null;
  endTime?: number | null;
  reason?: string | null;
}

// ── Equipe — Convites ────────────────────────────────────────────────────

export interface StaffInviteListItem {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  role: MembershipRole;
  serviceIds: string[];
  workDays: number[];
  status: StaffInviteStatus;
  expiresAt: string;
  createdAt: string;
  invitedByName: string;
}

export interface CreateStaffInviteDto {
  name: string;
  email: string;
  phone?: string | null;
  serviceIds: string[];
  /**
   * Dias trabalhados. Ignorado quando vem `schedule` — ali os dias já estão
   * marcados dia a dia, e duas fontes para o mesmo fato divergiriam.
   */
  workDays?: number[];
  /** A semana montada no modal, com entrada, saída e almoço de cada dia. */
  schedule?: WorkScheduleDay[];
}

/**
 * "Gerar link de cadastro" da linha do convite (l.2145). O token é guardado em
 * hash, então o link não é RECUPERÁVEL — é reemitido, e o anterior morre.
 */
export interface StaffInviteLink {
  url: string;
  expiresAt: string;
}

/** Estado da tela `CadastroFuncionario` — o e-mail vem travado do convite. */
export interface StaffInvitePreview {
  tenantName: string;
  name: string;
  email: string;
  serviceNames: string[];
  workDays: number[];
  expiresAt: string;
  valid: boolean;
  /** Motivo de invalidez, para a tela explicar (expirado/revogado/aceito). */
  invalidReason: 'EXPIRED' | 'REVOKED' | 'ACCEPTED' | null;
}

export interface AcceptStaffInviteDto {
  password: string;
}

// ── Agenda do staff ──────────────────────────────────────────────────────

export const AgendaView = {
  DAY: 'DAY',
  WEEK: 'WEEK',
  MONTH: 'MONTH',
  TIMELINE: 'TIMELINE',
} as const;
export type AgendaView = (typeof AgendaView)[keyof typeof AgendaView];

export interface StaffAppointmentItem {
  id: string;
  bookingCode: string;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  startsAt: string;
  endsAt: string;
  barberId: string;
  barberName: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  /** Agendamento avulso, sem cliente cadastrado (`guestName`/`guestPhone`). */
  isWalkIn: boolean;
  services: Array<{
    id: string;
    name: string;
    /** "Cor na agenda" do catálogo (`Service.color`). `null` = sem cor definida. */
    color: string | null;
    durationMin: number;
    /** Preço FOTOGRAFADO na reserva — `0` quando a assinatura cobriu a linha. */
    priceCents: number;
    /** A linha saiu de graça porque a assinatura do cliente a cobre. */
    coveredBySubscription: boolean;
    /** Preço de tabela do serviço hoje — o que a linha valeria sem cobertura. */
    listPriceCents: number;
  }>;
  totalPriceCents: number;
  /**
   * TODAS as linhas saíram por conta da assinatura (agente 31).
   *
   * Sem isto o drawer mostrava "Total R$ 0,00" para um combo de R$ 80 e
   * parecia defeito de preço: o zero era correto, faltava dizer POR QUÊ.
   */
  coveredBySubscription: boolean;
  /** Soma das durações — o bloco na grade é desenhado com ela. */
  durationMin: number;
  notes: string | null;
  /**
   * Faltas acumuladas do cliente NESTA barbearia. Alimenta o ⚠ da grade e do
   * drawer (protótipo: "Cliente com 2+ faltas"). `0` para walk-in.
   */
  clientNoShowCount: number;
}

export interface StaffAgendaQuery {
  /** `YYYY-MM-DD` — dia de referência (dia único, ou início da semana). */
  date: string;
  view: AgendaView;
  /**
   * Filtro do dropdown de barbeiros — MULTI-seleção (o protótipo marca com
   * checkbox). Vazio/ausente = todos. Ignorado para `BARBER`: o backend
   * sempre filtra pelo barbeiro logado.
   */
  barberIds?: string[];
}

/** Bloqueio de agenda (almoço/folga/manutenção) desenhado na grade. */
export interface StaffAgendaBlock {
  id: string;
  /** Minutos desde a meia-noite local. */
  startMinutes: number;
  endMinutes: number;
  reason: string | null;
  /** `true` = feriado/bloqueio da barbearia inteira (`barberId` nulo). */
  wholeShop: boolean;
}

export interface StaffAgendaBarberColumn {
  barberId: string;
  barberName: string;
  avatarUrl: string | null;
  appointments: StaffAppointmentItem[];
  /**
   * Expediente do barbeiro NESTE dia, em minutos locais. `null` quando ele
   * não trabalha (folga fixa, férias ou feriado) — a coluna é desenhada
   * inteira como indisponível.
   */
  workStartMinutes: number | null;
  workEndMinutes: number | null;
  /** Intervalo de almoço (`WorkSchedule`), quando houver. */
  lunchStartMinutes: number | null;
  lunchEndMinutes: number | null;
  blocks: StaffAgendaBlock[];
}

export interface StaffAgendaDay {
  /** `YYYY-MM-DD`. */
  date: string;
  weekday: number;
  barbers: StaffAgendaBarberColumn[];
}

export interface StaffAgendaResponse {
  timezone: string;
  view: AgendaView;
  days: StaffAgendaDay[];
  /** Barbeiros disponíveis para o filtro (vazio/um-só para `BARBER`). */
  barberOptions: Array<{ id: string; name: string; avatarUrl: string | null }>;
  /**
   * Limites verticais da grade, em minutos locais — união do expediente de
   * todas as colunas do período, com recuo para o horário da casa quando
   * ninguém trabalha. O protótipo cravava 08:00–20:00; aqui vem do dado.
   */
  gridStartMinutes: number;
  gridEndMinutes: number;
  /** Passo da grade (`TenantSettings.intervaloAgenda`) — clique em vaga. */
  slotIntervalMinutes: number;
}

// ── Agenda — visão de mês ────────────────────────────────────────────────

export interface StaffAgendaMonthCell {
  /** `YYYY-MM-DD`. */
  date: string;
  day: number;
  appointmentCount: number;
  /** Minutos ocupados ÷ minutos de expediente, 0–100. */
  occupancyPct: number;
  isToday: boolean;
}

export interface StaffAgendaMonthResponse {
  timezone: string;
  /** `YYYY-MM` do mês devolvido. */
  month: string;
  /** Quantas células vazias antes do dia 1 (semana começa na segunda). */
  leadingBlanks: number;
  cells: StaffAgendaMonthCell[];
}

// ── Agenda — grade de horários do modal de criação ───────────────────────

export interface StaffAgendaSlot {
  /** `HH:MM` local. */
  time: string;
  /** ISO/UTC — é este valor que volta no `POST`. */
  startsAt: string;
  /** `false` = ocupado; o protótipo desenha riscado e sem clique. */
  available: boolean;
  period: SlotPeriod;
}

export interface StaffAgendaSlotsResponse {
  timezone: string;
  date: string;
  totalDurationMin: number;
  slots: StaffAgendaSlot[];
}

// ── Agenda — detalhe do drawer ───────────────────────────────────────────

export interface StaffAgendaVisit {
  /** `YYYY-MM-DD`. */
  date: string;
  serviceName: string;
  totalPriceCents: number;
  /** Visita coberta pela assinatura — o histórico diz "Assinatura", não "R$ 0,00". */
  coveredBySubscription: boolean;
}

export interface StaffAppointmentDetail {
  appointment: StaffAppointmentItem;
  /** Últimas visitas concluídas do cliente nesta barbearia. */
  history: StaffAgendaVisit[];
  /**
   * Comanda já vinculada a este agendamento, se houver — o drawer alterna
   * entre "Abrir comanda" e "Ver comanda" com ela (agente 31).
   */
  order: { id: string; number: number; status: OrderStatus } | null;
}

// ── Agenda — bloqueio de horário ─────────────────────────────────────────

export interface CreateStaffAgendaBlockDto {
  /** `null`/ausente = barbearia inteira (o "Todos" do modal). */
  barberId?: string | null;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  /** `HH:MM`. Ambos ausentes = dia inteiro. */
  startTime?: string | null;
  endTime?: string | null;
  reason: string;
  notes?: string | null;
}

export interface StaffAgendaBlockItem {
  id: string;
  barberId: string | null;
  startDate: string;
  endDate: string;
  startMinutes: number | null;
  endMinutes: number | null;
  reason: string | null;
}

export interface CreateStaffAppointmentDto {
  barberId: string;
  serviceIds: string[];
  /** ISO/UTC. */
  startsAt: string;
  clientId?: string | null;
  /** Alternativa a `clientId` — walk-in sem cadastro. */
  walkIn?: { name: string; phone: string } | null;
  notes?: string | null;
  /**
   * Toggle "Enviar confirmação por WhatsApp" do modal. `true` enfileira a
   * confirmação no `NotificationOutbox`; o padrão do protótipo é ligado.
   */
  notifyWhatsapp?: boolean;
}

export interface MoveStaffAppointmentDto {
  startsAt: string;
  barberId?: string;
}

export interface CancelStaffAppointmentDto {
  reason?: string | null;
}
