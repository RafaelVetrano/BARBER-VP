/**
 * Financeiro — Caixa, Contas a pagar/receber, Vales, Contas bancárias e Fluxo
 * de caixa. Fase 07; revisto na auditoria 1:1 da aba (agente 18) contra
 * `Dashboard.dc.html` l.718–1088.
 */

import type { AccountRecurrence, AccountStatus, CashMovementType, PaymentMethod } from './enums';
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

/** Rótulo de `FREQUENCIAS` do protótipo, na ordem em que aparece no select. */
export const ACCOUNT_RECURRENCE_LABEL: Record<AccountRecurrence, string> = {
  MONTHLY: 'Mensal',
  WEEKLY: 'Semanal',
  YEARLY: 'Anual',
};
export const ACCOUNT_RECURRENCE_ORDER: AccountRecurrence[] = ['MONTHLY', 'WEEKLY', 'YEARLY'];

/**
 * Quantas ocorrências uma conta recorrente materializa na criação.
 *
 * O protótipo só liga o toggle; o servidor precisa decidir o que gravar.
 * Doze períodos cobrem o horizonte que a tela mostra (KPIs do mês + tabela por
 * vencimento) sem virar uma tabela infinita, e a série fica identificada por
 * `seriesId` para uma renovação futura conseguir continuar de onde parou.
 */
export const ACCOUNT_RECURRENCE_OCCURRENCES = 12;

// ── Caixa ────────────────────────────────────────────────────────────────

/**
 * Categorias das movimentações lançadas À MÃO no caixa (os botões
 * "+ Entrada avulsa" e "+ Saída/Sangria"). As movimentações de venda têm a
 * categoria derivada dos itens da comanda, não escolhida por ninguém.
 */
export const CASH_ENTRY_CATEGORIES = ['Reforço de caixa', 'Venda avulsa', 'Outra entrada'] as const;
export const CASH_EXIT_CATEGORIES = [
  'Sangria',
  'Compra de produto',
  'Despesa operacional',
  'Outra saída',
] as const;
export type CashEntryCategory = (typeof CASH_ENTRY_CATEGORIES)[number];
export type CashExitCategory = (typeof CASH_EXIT_CATEGORIES)[number];

export interface CashMovementItem {
  id: string;
  type: CashMovementType;
  /** Positivo entra, negativo sai — é o sinal que colore a linha. */
  amountCents: number;
  description: string | null;
  /** `null` na abertura e no fechamento, que não têm forma de pagamento. */
  method: PaymentMethod | null;
  category: string | null;
  createdAt: string;
}

/** Um total por forma de pagamento — alimenta o resumo do modal de fechamento. */
export interface CashMethodTotal {
  method: PaymentMethod;
  amountCents: number;
}

export interface CashRegisterSummary {
  id: string;
  openingCents: number;
  /** Saldo inicial + entradas − saídas, com TODAS as formas (KPI "Saldo atual"). */
  currentCents: number;
  /** Soma das movimentações positivas do caixa, sem o saldo inicial. */
  entriesCents: number;
  /** Soma das movimentações negativas, já em valor absoluto. */
  exitsCents: number;
  /**
   * O que deveria estar na gaveta: saldo inicial + entradas em DINHEIRO −
   * saídas em dinheiro. É contra este número que a conferência do fechamento
   * calcula sobra/quebra — cartão e Pix não passam pela gaveta.
   */
  expectedCashCents: number;
  byMethod: CashMethodTotal[];
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

/** "+ Entrada avulsa" / "+ Saída/Sangria" — o sinal vem de `direction`. */
export interface CreateCashMovementDto {
  direction: 'IN' | 'OUT';
  /** Sempre positivo; quem inverte o sinal de uma saída é o servidor. */
  amountCents: number;
  description: string;
  category: string;
  method: PaymentMethod;
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
  recurrence: AccountRecurrence | null;
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
  recurrence: AccountRecurrence | null;
  bankAccountId: string | null;
  bankAccountName: string | null;
  notes: string | null;
}

/** Os 3 KPIs do topo das sub-abas Contas a pagar / a receber. */
export interface AccountSummary {
  /** Em aberto com vencimento no passado. */
  overdueCents: number;
  /** Em aberto vencendo de hoje até o 7º dia. */
  next7DaysCents: number;
  /** Tudo que vence no mês corrente, liquidado ou não. */
  monthCents: number;
}

export interface AccountListQuery extends PaginationQuery {
  status?: AccountStatus;
  category?: string;
}

/** A listagem carrega os KPIs junto: são o mesmo recorte, numa ida só. */
export type AccountPayableListResponse = Paginated<AccountPayableItem> & { summary: AccountSummary };
export type AccountReceivableListResponse = Paginated<AccountReceivableItem> & {
  summary: AccountSummary;
};

export interface CreateAccountPayableDto {
  description: string;
  category: AccountPayableCategory;
  supplier?: string | null;
  /** Valor de CADA parcela quando `installments > 1`. */
  amountCents: number;
  dueDate: string;
  installments?: number;
  recurrence?: AccountRecurrence | null;
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
  recurrence?: AccountRecurrence | null;
  bankAccountId?: string | null;
  notes?: string | null;
}

// ── Contas bancárias ─────────────────────────────────────────────────────

/** Os dois tipos do select "Tipo" do modal de nova conta bancária. */
export const BANK_ACCOUNT_TYPES = ['Conta bancária', 'Dinheiro em espécie'] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

/**
 * `FORMAS_PAGAMENTO_OPTIONS` do protótipo mapeadas no enum real. `SUBSCRIPTION`
 * e `LOYALTY` ficam de fora: não são dinheiro entrando numa conta, são
 * descontos aplicados antes do rateio (mesma decisão de `SPLIT_METHODS`).
 */
export const BANK_ACCOUNT_METHODS: PaymentMethod[] = ['PIX', 'CREDIT', 'DEBIT', 'CASH'];

export interface BankAccountItem {
  id: string;
  name: string;
  /** Texto livre exibido sob o nome do card ("Pix / Transferência / Cartão"). */
  type: string | null;
  bank: string | null;
  agency: string | null;
  account: string | null;
  /** Formas que caem nesta conta — a linha "Recebe: …" e o mapa forma → conta. */
  acceptedMethods: PaymentMethod[];
  balanceCents: number;
  active: boolean;
}

export interface UpsertBankAccountDto {
  name: string;
  type?: string | null;
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  acceptedMethods?: PaymentMethod[];
  balanceCents?: number;
}

// ── Fluxo de caixa ───────────────────────────────────────────────────────

/** Uma linha do detalhe expandido do mês ("Entradas por categoria"). */
export interface CashFlowCategoryTotal {
  name: string;
  amountCents: number;
}

export interface CashFlowMonth {
  /** `YYYY-MM`. */
  month: string;
  label: string;
  inCents: number;
  outCents: number;
  /** Entradas − saídas do mês. */
  balanceCents: number;
  /** Saldo corrido desde o início da janela — a linha dourada do gráfico. */
  accumulatedCents: number;
  inflowByCategory: CashFlowCategoryTotal[];
  outflowByCategory: CashFlowCategoryTotal[];
}

export interface CashFlowResponse {
  months: CashFlowMonth[];
}
