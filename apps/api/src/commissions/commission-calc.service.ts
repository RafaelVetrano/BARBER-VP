import { Injectable } from '@nestjs/common';
import { CommissionEntryKind, CommissionEntryStatus, CommissionRuleType } from '@prisma/client';
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

/** Seleção da regra que os dois cálculos (serviço e produto) precisam. */
const RULE_SELECT = {
  type: true,
  percentBps: true,
  percentProdutosBps: true,
  tiers: { select: { upToCents: true, percentBps: true, sortOrder: true } },
} as const;

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
 * A taxa de SERVIÇO é PROVISÓRIA aqui — usa o faturamento acumulado do
 * barbeiro no mês ATÉ este item (rodando comanda a comanda, dentro do mês).
 * "Fechar período" (`CommissionsService.closePeriod`) recalcula com o
 * faturamento FINAL do mês inteiro e trava (`status: PAID`) — é o "fechar
 * período trava o cálculo" do enunciado.
 *
 * PRODUTO usa o percentual único da regra (`percentProdutosBps`) e nunca
 * progride por faixa: o modal do protótipo rotula o campo como "% produtos
 * (todas as faixas)". Por isso o lançamento de produto já nasce definitivo, e
 * a soma acumulada que escolhe a faixa conta SÓ os lançamentos de serviço —
 * misturar as duas bases inflaria a faixa com dinheiro que não é comissionado
 * por ela.
 *
 * (Até a auditoria da aba Comissões, produto não gerava comissão nenhuma. A
 * coluna "Comissão produtos" do protótipo e o campo "% produtos" do modal de
 * regras é que trouxeram a regra para o modelo — `percentProdutosBps` nasce
 * em 0, então nada muda para quem não configurar.)
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
      /** Serviço vendido — pode carregar uma comissão específica. */
      serviceId?: string | null;
    },
  ): Promise<void> {
    if (params.baseCents <= 0) {
      return;
    }

    const referenceMonth = params.referenceMonth ?? monthStart();

    const barber = await tx.barber.findUnique({
      where: { id: params.barberId },
      select: { commissionRule: { select: RULE_SELECT } },
    });

    const rule = barber?.commissionRule;
    if (!rule) {
      // Barbeiro sem regra de comissão vinculada — nenhuma comissão a lançar.
      return;
    }

    const prior = await tx.commissionEntry.aggregate({
      where: {
        tenantId: params.tenantId,
        barberId: params.barberId,
        referenceMonth,
        kind: CommissionEntryKind.SERVICE,
      },
      _sum: { baseCents: true },
    });
    const cumulative = (prior._sum.baseCents ?? 0) + params.baseCents;

    // Comissão ESPECÍFICA do serviço (`Service.commissionBps`, aba Serviços &
    // Produtos) vence a regra do barbeiro: é o override que o dono configurou
    // item a item. O acumulado do mês segue sendo somado — um serviço com
    // percentual próprio continua contando para a faixa dos demais, porque o
    // faturamento do barbeiro é um só.
    const override = params.serviceId
      ? (
          await tx.service.findUnique({
            where: { id: params.serviceId },
            select: { commissionBps: true },
          })
        )?.commissionBps ?? null
      : null;

    const percentBps = override ?? pickTierPercent(rule, cumulative);
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
        kind: CommissionEntryKind.SERVICE,
        status: CommissionEntryStatus.PENDING,
      },
    });
  }

  /**
   * Comissão de um item de PRODUTO. Percentual único da regra, sem faixa e sem
   * acumulado — ver o comentário da classe.
   */
  async recordProductEntry(
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

    const barber = await tx.barber.findUnique({
      where: { id: params.barberId },
      select: { commissionRule: { select: RULE_SELECT } },
    });

    const percentBps = barber?.commissionRule?.percentProdutosBps ?? 0;
    // Regra com 0% de produto é o padrão do modelo: não gravar a linha evita
    // encher o extrato de lançamentos de R$0,00 que só fazem barulho.
    if (percentBps <= 0) {
      return;
    }

    await tx.commissionEntry.create({
      data: {
        tenantId: params.tenantId,
        barberId: params.barberId,
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        referenceMonth: params.referenceMonth ?? monthStart(),
        baseCents: params.baseCents,
        percentBps,
        amountCents: Math.round((params.baseCents * percentBps) / 10_000),
        kind: CommissionEntryKind.PRODUCT,
        status: CommissionEntryStatus.PENDING,
      },
    });
  }
}
