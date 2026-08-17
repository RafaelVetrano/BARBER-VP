/**
 * Contratos da operação diária do dashboard (fase 06) — Clientes, Serviços &
 * Produtos, Equipe (barbeiros, escala, convites) e Agenda interna.
 *
 * Mesma regra das demais famílias: o que a API devolve e o frontend consome é
 * definido aqui uma vez só, para as duas pontas não divergirem.
 */

import type { AppointmentOrigin, AppointmentStatus, MembershipRole, ScheduleExceptionType, StaffInviteStatus } from './enums';
import type { Paginated, PaginationQuery } from './http';

// ── Clientes ─────────────────────────────────────────────────────────────

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
}

export type ClientListSort = 'name' | 'lastVisitAt' | 'visitCount' | 'createdAt';

export interface ClientListQuery extends PaginationQuery {
  search?: string;
  favoriteBarberId?: string;
  blocked?: boolean;
  sort?: ClientListSort;
  order?: 'asc' | 'desc';
}

export type ClientListResponse = Paginated<ClientListItem>;

export interface UpdateClientProfileDto {
  notes?: string | null;
  favoriteBarberId?: string | null;
}

// ── Catálogo — Serviços ──────────────────────────────────────────────────

export interface ServiceListItem {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  category: string | null;
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
export type ServiceListResponse = Paginated<ServiceListItem>;

export interface UpsertServiceDto {
  name: string;
  description?: string | null;
  durationMin: number;
  priceCents: number;
  category?: string | null;
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
  lowStock: boolean;
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
  /** É o barbeiro-dono, criado automaticamente no registro — não removível. */
  isOwner: boolean;
  /** Tem `User` próprio (login em `DashboardFuncionario`). */
  hasLogin: boolean;
  serviceIds: string[];
  workSchedule: WorkScheduleDay[];
}

export interface UpdateBarberDto {
  name?: string;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  active?: boolean;
  serviceIds?: string[];
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
  workDays: number[];
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
  services: Array<{ id: string; name: string; durationMin: number; priceCents: number }>;
  totalPriceCents: number;
  notes: string | null;
}

export interface StaffAgendaQuery {
  /** `YYYY-MM-DD` — dia de referência (dia único, ou início da semana). */
  date: string;
  view: AgendaView;
  /** Ignorado para `BARBER` — o backend sempre filtra pelo barbeiro logado. */
  barberId?: string;
}

export interface StaffAgendaBarberColumn {
  barberId: string;
  barberName: string;
  avatarUrl: string | null;
  appointments: StaffAppointmentItem[];
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
}

export interface MoveStaffAppointmentDto {
  startsAt: string;
  barberId?: string;
}

export interface CancelStaffAppointmentDto {
  reason?: string | null;
}
