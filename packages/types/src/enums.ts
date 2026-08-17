/**
 * Enums do domínio — espelham 1:1 os enums do `schema.prisma`.
 *
 * O Prisma Client já gera enums equivalentes para a API; estes existem para o
 * frontend (que não importa `@prisma/client`) e para contratos compartilhados.
 * Ao alterar um enum no schema, alterar aqui na mesma PR.
 */

export const TenantStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CANCELED: 'CANCELED',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const MembershipRole = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  BARBER: 'BARBER',
} as const;
export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

/** Papéis usados pelo `@Roles()` — inclui os globais fora de `Membership`. */
export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  BARBER: 'BARBER',
  CLIENT: 'CLIENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AppointmentStatus = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  DONE: 'DONE',
  NO_SHOW: 'NO_SHOW',
  CANCELED: 'CANCELED',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

/** Status que NÃO participam da EXCLUDE constraint anti double-booking. */
export const NON_BLOCKING_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  AppointmentStatus.CANCELED,
  AppointmentStatus.NO_SHOW,
];

export const AppointmentOrigin = {
  PUBLIC: 'PUBLIC',
  DASHBOARD: 'DASHBOARD',
} as const;
export type AppointmentOrigin = (typeof AppointmentOrigin)[keyof typeof AppointmentOrigin];

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELED',
  PAUSED: 'PAUSED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const OrderStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CANCELED: 'CANCELED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const OrderItemKind = {
  SERVICE: 'SERVICE',
  PRODUCT: 'PRODUCT',
} as const;
export type OrderItemKind = (typeof OrderItemKind)[keyof typeof OrderItemKind];

export const DiscountType = {
  PERCENT: 'PERCENT',
  FIXED: 'FIXED',
} as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export const PaymentMethod = {
  CASH: 'CASH',
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
  PIX: 'PIX',
  SUBSCRIPTION: 'SUBSCRIPTION',
  LOYALTY: 'LOYALTY',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const CommissionRuleType = {
  FIXED: 'FIXED',
  TIERED: 'TIERED',
} as const;
export type CommissionRuleType = (typeof CommissionRuleType)[keyof typeof CommissionRuleType];

export const CashMovementType = {
  OPENING: 'OPENING',
  SALE: 'SALE',
  WITHDRAWAL: 'WITHDRAWAL',
  DEPOSIT: 'DEPOSIT',
  ADJUSTMENT: 'ADJUSTMENT',
  CLOSING: 'CLOSING',
} as const;
export type CashMovementType = (typeof CashMovementType)[keyof typeof CashMovementType];

export const CashRegisterStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type CashRegisterStatus = (typeof CashRegisterStatus)[keyof typeof CashRegisterStatus];

export const AccountStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  RECEIVED: 'RECEIVED',
  OVERDUE: 'OVERDUE',
  CANCELED: 'CANCELED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const RaffleStatus = {
  ACTIVE: 'ACTIVE',
  FINISHED: 'FINISHED',
  CANCELED: 'CANCELED',
} as const;
export type RaffleStatus = (typeof RaffleStatus)[keyof typeof RaffleStatus];

export const OutboxStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;
export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus];

/** Eventos com template parametrizado em `WhatsappAutomationConfig`. */
export const WhatsappEvent = {
  REMINDER: 'REMINDER',
  CONFIRMATION: 'CONFIRMATION',
  CANCELLATION: 'CANCELLATION',
  BIRTHDAY: 'BIRTHDAY',
  REACTIVATION: 'REACTIVATION',
  REVIEW: 'REVIEW',
} as const;
export type WhatsappEvent = (typeof WhatsappEvent)[keyof typeof WhatsappEvent];

/** Placeholders aceitos nos templates de WhatsApp. */
export const WHATSAPP_TEMPLATE_VARS = [
  'nome',
  'data',
  'horario',
  'servico',
  'barbeiro',
  'link_agendamento',
] as const;
export type WhatsappTemplateVar = (typeof WHATSAPP_TEMPLATE_VARS)[number];

/** Dia da semana em `WorkSchedule` — 0 = domingo (compatível com `Date#getDay`). */
export const Weekday = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;
export type Weekday = (typeof Weekday)[keyof typeof Weekday];

export const ScheduleExceptionType = {
  DAY_OFF: 'DAY_OFF',
  VACATION: 'VACATION',
  HOLIDAY: 'HOLIDAY',
  CUSTOM_HOURS: 'CUSTOM_HOURS',
} as const;
export type ScheduleExceptionType =
  (typeof ScheduleExceptionType)[keyof typeof ScheduleExceptionType];

/** Ciclo do convite de funcionário (`CadastroFuncionario.dc.html`, fase 06). */
export const StaffInviteStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;
export type StaffInviteStatus = (typeof StaffInviteStatus)[keyof typeof StaffInviteStatus];
