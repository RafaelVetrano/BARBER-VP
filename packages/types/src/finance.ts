/**
 * Financeiro — Caixa, Contas a pagar/receber, Contas bancárias, Fluxo de
 * caixa. Fase 07.
 */

import type { AccountStatus, CashMovementType } from './enums';
import type { Paginated, PaginationQuery } from './http';

/** `CATEGORIAS_PAGAR` real de `Dashboard.dc.html` — não inventar categoria nova. */
export const ACCOUNT_PAYABLE_CATEGORIES = [
  'Aluguel',
  'Produtos',
  'Energia',
  'Software',
  'Internet',
  'Manutenção',
  'Água',
  'Marketing',
  'Contabilidade',
  'Outro',
] as const;
export type AccountPayableCategory = (typeof ACCOUNT_PAYABLE_CATEGORIES)[number];

/** `CATEGORIAS_RECEBER` real de `Dashboard.dc.html`. */
export const ACCOUNT_RECEIVABLE_CATEGORIES = ['Mensalidade', 'Venda parcelada', 'Outro'] as const;
export type AccountReceivableCategory = (typeof ACCOUNT_RECEIVABLE_CATEGORIES)[number];

// ── Caixa ────────────────────────────────────────────────────────────────

export interface CashMovementItem {
  id: string;
  type: CashMovementType;
  amountCents: number;
  description: string | null;
  createdAt: string;
}

export interface CashRegisterSummary {
  id: string;
  openingCents: number;
  /** Soma calculada das movimentações — só existe quando o caixa está aberto ou já foi fechado. */
  currentCents: number;
  expectedCents: number | null;
  countedCents: number | null;
  differenceCents: number | null;
  openedAt: string;
  closedAt: string | null;
  openedByName: string | null;
  movements: CashMovementItem[];
}

export interface CashRegisterStatusResponse {
  open: boolean;
  register: CashRegisterSummary | null;
}

export interface OpenCashRegisterDto {
  openingCents: number;
}

export interface CloseCashRegisterDto {
  countedCents: number;
  notes?: string | null;
}

export interface CashMovementDto {
  amountCents: number;
  description?: string | null;
}

// ── Contas a pagar/receber ───────────────────────────────────────────────

export interface AccountPayableItem {
  id: string;
  description: string;
  category: string;
  supplier: string | null;
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  status: AccountStatus;
  installment: number;
  installments: number;
  bankAccountId: string | null;
  bankAccountName: string | null;
  notes: string | null;
}

export interface AccountReceivableItem {
  id: string;
  description: string;
  category: string;
  customer: string | null;
  amountCents: number;
  dueDate: string;
  receivedAt: string | null;
  status: AccountStatus;
  installment: number;
  installments: number;
  bankAccountId: string | null;
  bankAccountName: string | null;
  notes: string | null;
}

export interface AccountListQuery extends PaginationQuery {
  status?: AccountStatus;
  category?: string;
}
export type AccountPayableListResponse = Paginated<AccountPayableItem>;
export type AccountReceivableListResponse = Paginated<AccountReceivableItem>;

export interface CreateAccountPayableDto {
  description: string;
  category: AccountPayableCategory;
  supplier?: string | null;
  amountCents: number;
  dueDate: string;
  installments?: number;
  bankAccountId?: string | null;
  notes?: string | null;
}

export interface CreateAccountReceivableDto {
  description: string;
  category: AccountReceivableCategory;
  customer?: string | null;
  amountCents: number;
  dueDate: string;
  installments?: number;
  bankAccountId?: string | null;
  notes?: string | null;
}

// ── Contas bancárias ─────────────────────────────────────────────────────

export interface BankAccountItem {
  id: string;
  name: string;
  bank: string | null;
  agency: string | null;
  account: string | null;
  balanceCents: number;
  active: boolean;
}

export interface UpsertBankAccountDto {
  name: string;
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  balanceCents?: number;
}

// ── Fluxo de caixa ───────────────────────────────────────────────────────

export interface CashFlowMonth {
  /** `YYYY-MM`. */
  month: string;
  label: string;
  inCents: number;
  outCents: number;
  balanceCents: number;
}

export interface CashFlowResponse {
  months: CashFlowMonth[];
}
