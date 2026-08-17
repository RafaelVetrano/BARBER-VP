export const PAYMENT_ADAPTER = 'PAYMENT_ADAPTER';

export type PaymentBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO';

export type ExternalChargeStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'REFUNDED'
  | 'FAILED'
  | 'CANCELED';

export interface CreateChargeParams {
  tenantId: string;
  /** Referência interna (`Order.id` ou `ClientSubscription.id`). */
  referenceId: string;
  amountCents: number;
  billingType: PaymentBillingType;
  description: string;
  dueDate?: Date;
  customer: {
    name: string;
    /** E.164. */
    phone: string;
    email?: string | null;
    document?: string | null;
  };
}

export interface CreateSubscriptionChargeParams extends Omit<CreateChargeParams, 'dueDate'> {
  /** Dia do mês da cobrança recorrente (SPEC: dia 5). */
  billingDay: number;
  cycle: 'MONTHLY';
}

export interface ExternalCharge {
  externalId: string;
  status: ExternalChargeStatus;
  amountCents: number;
  /** Link/copia-e-cola de pagamento — sintético no driver mock. */
  paymentUrl: string | null;
  pixPayload: string | null;
  dueDate: Date | null;
  createdAt: Date;
}

/**
 * Contrato do gateway (Asaas na fase 09). Nenhum módulo de negócio importa o
 * driver concreto — só este símbolo.
 */
export interface PaymentAdapter {
  createCharge(params: CreateChargeParams): Promise<ExternalCharge>;
  createSubscription(params: CreateSubscriptionChargeParams): Promise<ExternalCharge>;
  getCharge(externalId: string): Promise<ExternalCharge | null>;
  cancelCharge(externalId: string): Promise<ExternalCharge>;
  refundCharge(externalId: string): Promise<ExternalCharge>;
  /**
   * Avança o ciclo manualmente — aprovação/recusa pelo super admin enquanto o
   * driver for mock (SPEC.md → Adapters). O driver real ignora e responde 501.
   */
  simulateTransition(externalId: string, status: ExternalChargeStatus): Promise<ExternalCharge>;
}
