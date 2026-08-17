import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type { PublicSubscriptionSummary } from '@barbervp/types';
import { PrismaService, type PrismaTransaction } from '../prisma/prisma.service';

export interface ServiceCoverage {
  /** Saldo que cobriria este serviço agora. */
  usageId: string;
  quota: number;
  used: number;
  /** Ciclo esgotado: a assinatura inclui o serviço, mas os usos acabaram. */
  exhausted: boolean;
}

/**
 * Leitura da assinatura do cliente (`ClientSubscription`) para o wizard.
 *
 * A ESCRITA — vender plano, cobrar, renovar ciclo — é da fase 05. O que existe
 * aqui é o consumo: dizer se o serviço escolhido sai de graça ("Incluído na
 * assinatura") e, na hora de reservar, debitar o uso.
 *
 * O débito é o `UPDATE ... WHERE used < quota` do SPEC, em SQL cru de
 * propósito: um `findFirst` seguido de `update` seria uma corrida clássica —
 * dois agendamentos simultâneos leriam `used = 3, quota = 4` e ambos gravariam
 * 4, entregando cinco cortes por quatro pagos. A CHECK
 * `subscription_usage_within_quota` é a rede embaixo disso.
 */
@Injectable()
export class SubscriptionCoverageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cobertura por serviço para o cliente logado. Cliente anônimo (guest) nunca
   * tem cobertura — a assinatura pertence a uma conta.
   */
  async coverageFor(
    tenantId: string,
    clientId: string | null,
    serviceIds: string[],
    now = new Date(),
  ): Promise<Map<string, ServiceCoverage>> {
    const coverage = new Map<string, ServiceCoverage>();
    if (!clientId || serviceIds.length === 0) {
      return coverage;
    }

    const usages = await this.prisma.subscriptionUsage.findMany({
      where: {
        tenantId,
        serviceId: { in: serviceIds },
        periodStart: { lte: now },
        periodEnd: { gt: now },
        subscription: { clientId, tenantId, status: SubscriptionStatus.ACTIVE },
      },
      select: { id: true, serviceId: true, quota: true, used: true },
    });

    for (const usage of usages) {
      const current = coverage.get(usage.serviceId);
      // Com duas assinaturas cobrindo o mesmo serviço, a que ainda tem saldo vence.
      if (current && !current.exhausted) {
        continue;
      }
      coverage.set(usage.serviceId, {
        usageId: usage.id,
        quota: usage.quota,
        used: usage.used,
        exhausted: usage.used >= usage.quota,
      });
    }

    return coverage;
  }

  /**
   * Debita um uso de forma atômica. Devolve `false` quando a quota acabou entre
   * a cotação e a confirmação — o chamador então cobra o preço cheio em vez de
   * recusar a reserva, porque o cliente veio agendar, não comprar plano.
   */
  async debit(tx: PrismaTransaction, usageId: string): Promise<boolean> {
    const affected = await tx.$executeRaw`
      UPDATE "SubscriptionUsage"
      SET "used" = "used" + 1, "updatedAt" = NOW()
      WHERE "id" = ${usageId} AND "used" < "quota"
    `;
    return affected === 1;
  }

  /** Devolve o uso ao cancelar — o cliente não perde o corte que não usou. */
  async refund(tx: PrismaTransaction, usageId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE "SubscriptionUsage"
      SET "used" = GREATEST(0, "used" - 1), "updatedAt" = NOW()
      WHERE "id" = ${usageId}
    `;
  }

  /** Resumo da assinatura ativa para o cabeçalho da página pública. */
  async activeSubscription(
    tenantId: string,
    clientId: string,
    now = new Date(),
  ): Promise<PublicSubscriptionSummary | null> {
    const subscription = await this.prisma.clientSubscription.findFirst({
      where: {
        tenantId,
        clientId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { gt: now },
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        currentPeriodEnd: true,
        plan: { select: { name: true } },
        usages: {
          where: { periodStart: { lte: now }, periodEnd: { gt: now } },
          select: {
            serviceId: true,
            quota: true,
            used: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      planName: subscription.plan.name,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      usages: subscription.usages.map((usage) => ({
        serviceId: usage.serviceId,
        serviceName: usage.service.name,
        quota: usage.quota,
        used: usage.used,
      })),
    };
  }
}
