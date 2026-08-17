import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from '../../redis/redis.service';
import { ApiException } from '../../common/errors/api.exception';
import type {
  CreateChargeParams,
  CreateSubscriptionChargeParams,
  ExternalCharge,
  ExternalChargeStatus,
  PaymentAdapter,
} from './payment.adapter';

/** 30 dias — tempo de vida de uma cobrança simulada no Redis. */
const CHARGE_TTL_SECONDS = 60 * 60 * 24 * 30;
const KEY_PREFIX = 'bvp:mock-payment:charge:';

/** Transições legítimas — o mock recusa saltos impossíveis, como o gateway real. */
const ALLOWED_TRANSITIONS: Record<ExternalChargeStatus, ExternalChargeStatus[]> = {
  PENDING: ['CONFIRMED', 'FAILED', 'CANCELED'],
  CONFIRMED: ['RECEIVED', 'REFUNDED'],
  RECEIVED: ['REFUNDED'],
  REFUNDED: [],
  FAILED: ['PENDING'],
  CANCELED: [],
};

/**
 * Driver mock do gateway. Guarda o estado das cobranças no Redis (sobrevive a
 * reload da API, some com `make reset`) e simula o ciclo de vida: PENDING →
 * CONFIRMED → RECEIVED, com aprovação/recusa disparada manualmente pelo super
 * admin (fase 08). Nenhuma chamada externa.
 */
@Injectable()
export class MockPaymentDriver implements PaymentAdapter {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MockPaymentDriver.name);
  }

  async createCharge(params: CreateChargeParams): Promise<ExternalCharge> {
    return this.persist(this.build(params, params.dueDate ?? null));
  }

  async createSubscription(params: CreateSubscriptionChargeParams): Promise<ExternalCharge> {
    return this.persist(this.build(params, this.nextBillingDate(params.billingDay)));
  }

  async getCharge(externalId: string): Promise<ExternalCharge | null> {
    const raw = await this.redis.client.get(KEY_PREFIX + externalId);
    return raw ? this.deserialize(raw) : null;
  }

  async cancelCharge(externalId: string): Promise<ExternalCharge> {
    return this.simulateTransition(externalId, 'CANCELED');
  }

  async refundCharge(externalId: string): Promise<ExternalCharge> {
    return this.simulateTransition(externalId, 'REFUNDED');
  }

  async simulateTransition(
    externalId: string,
    status: ExternalChargeStatus,
  ): Promise<ExternalCharge> {
    const charge = await this.getCharge(externalId);
    if (!charge) {
      throw ApiException.notFound('Cobrança não encontrada no gateway simulado.');
    }
    if (!ALLOWED_TRANSITIONS[charge.status].includes(status)) {
      throw ApiException.conflict(
        `Transição inválida: ${charge.status} → ${status}.`,
      );
    }

    const updated: ExternalCharge = { ...charge, status };
    await this.persist(updated);

    this.logger.info(
      { externalId, from: charge.status, to: status },
      'cobrança simulada avançou de estado',
    );

    return updated;
  }

  private build(params: CreateChargeParams, dueDate: Date | null): ExternalCharge {
    const externalId = `mock_${randomUUID()}`;
    return {
      externalId,
      status: 'PENDING',
      amountCents: params.amountCents,
      paymentUrl:
        params.billingType === 'PIX' ? null : `https://mock.gateway.local/charge/${externalId}`,
      pixPayload: params.billingType === 'PIX' ? `00020126MOCK${externalId}5204000053039865802BR` : null,
      dueDate,
      createdAt: new Date(),
    };
  }

  private async persist(charge: ExternalCharge): Promise<ExternalCharge> {
    await this.redis.client.set(
      KEY_PREFIX + charge.externalId,
      JSON.stringify(charge),
      'EX',
      CHARGE_TTL_SECONDS,
    );
    return charge;
  }

  private deserialize(raw: string): ExternalCharge {
    const parsed = JSON.parse(raw) as ExternalCharge;
    return {
      ...parsed,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      createdAt: new Date(parsed.createdAt),
    };
  }

  /** Próxima ocorrência do dia de cobrança (ex.: dia 5), em UTC. */
  private nextBillingDate(billingDay: number): Date {
    const now = new Date();
    const candidate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), billingDay, 12, 0, 0),
    );
    if (candidate <= now) {
      candidate.setUTCMonth(candidate.getUTCMonth() + 1);
    }
    return candidate;
  }
}
