import { Injectable } from '@nestjs/common';
import { CommissionEntryStatus, CommissionRuleType } from '@prisma/client';
import { PrismaService, type PrismaTransaction } from '../prisma/prisma.service';

/** Primeiro dia do mês (UTC) — `CommissionEntry.referenceMonth`/`Vale.referenceMonth`. */
export function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

interface RuleWithTiers {
  type: CommissionRuleType;
  percentBps: number | null;
  tiers: Array<{ upToCents: number | null; percentBps: number; sortOrder: number }>;
}

/** Escolhe a faixa pelo faturamento ACUMULADO no mês (`SPEC.md`: até R$5000 → 40%, até R$8000 → 45%, acima → 50%). */
export function pickTierPercent(rule: RuleWithTiers, cumulativeBaseCents: number): number {
  if (rule.type === CommissionRuleType.FIXED) {
    return rule.percentBps ?? 0;
  }
  const sorted = [...rule.tiers].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const tier of sorted) {
    if (tier.upToCents === null || cumulativeBaseCents <= tier.upToCents) {
      return tier.percentBps;
    }
  }
  return sorted.at(-1)?.percentBps ?? 0;
}

/**
 * Calcula e grava o `CommissionEntry` de um item de comanda, no MESMO
 * `$transaction` do fechamento (`OrdersService.close`).
 *
 * A taxa é PROVISÓRIA aqui — usa o faturamento acumulado do barbeiro no mês
 * ATÉ este item (rodando comanda a comanda, dentro do mês). "Fechar período"
 * (`CommissionsService.closePeriod`) recalcula com o faturamento FINAL do mês
 * inteiro e trava (`status: PAID`) — é o "fechar período trava o cálculo" do
 * enunciado. Produtos não geram comissão (decisão herdada do seed da fase 01:
 * "comissão sobre o serviço, produto não gera comissão nesta regra").
 */
@Injectable()
export class CommissionCalcService {
  constructor(private readonly prisma: PrismaService) {}

  async recordServiceEntry(
    tx: PrismaTransaction,
    params: {
      tenantId: string;
      barberId: string;
      orderId: string;
      orderItemId: string;
      baseCents: number;
      referenceMonth?: Date;
    },
  ): Promise<void> {
    if (params.baseCents <= 0) {
      return;
    }

    const referenceMonth = params.referenceMonth ?? monthStart();

    const barber = await tx.barber.findUnique({
      where: { id: params.barberId },
      select: {
        commissionRule: {
          select: {
            type: true,
            percentBps: true,
            tiers: { select: { upToCents: true, percentBps: true, sortOrder: true } },
          },
        },
      },
    });

    const rule = barber?.commissionRule;
    if (!rule) {
      // Barbeiro sem regra de comissão vinculada — nenhuma comissão a lançar.
      return;
    }

    const prior = await tx.commissionEntry.aggregate({
      where: { tenantId: params.tenantId, barberId: params.barberId, referenceMonth },
      _sum: { baseCents: true },
    });
    const cumulative = (prior._sum.baseCents ?? 0) + params.baseCents;

    const percentBps = pickTierPercent(rule, cumulative);
    const amountCents = Math.round((params.baseCents * percentBps) / 10_000);

    await tx.commissionEntry.create({
      data: {
        tenantId: params.tenantId,
        barberId: params.barberId,
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        referenceMonth,
        baseCents: params.baseCents,
        percentBps,
        amountCents,
        status: CommissionEntryStatus.PENDING,
      },
    });
  }
}
