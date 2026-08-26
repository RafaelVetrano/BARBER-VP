import { Injectable } from '@nestjs/common';
import { AppointmentStatus, CommissionRuleType } from '@prisma/client';
import {
  PRICE_CALC_LIMITS,
  computePriceCalculator,
  type PriceCalculatorConfig,
  type PriceCalculatorState,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import type { UpdatePriceCalculatorDto } from './dto/price-calculator.dto';

/**
 * Calculadora de preço inteligente — sub-aba do catálogo, plano **Avançado**
 * (`Dashboard.dc.html` l.1856–2022).
 *
 * Duas diferenças de fundo para o protótipo, ambas deliberadas:
 *
 * 1. **Persiste.** No desenho a calculadora era um rascunho volátil; aqui é
 *    configuração da barbearia, e o dono volta a consultá-la no mês seguinte.
 * 2. **Os valores iniciais são DADO, não desenho.** O protótipo abria com
 *    "Aluguel R$2.500 / Energia R$450 / … / 480 atendimentos / 45%", números
 *    que não são de barbearia nenhuma. Aqui a comissão média sai das regras
 *    reais, os atendimentos saem da produção dos últimos 30 dias e o preço
 *    praticado sai do catálogo. A lista de custos fixos começa VAZIA — não há
 *    de onde deduzir o aluguel de alguém, e inventá-lo daria um preço mínimo
 *    convincente e falso.
 */
@Injectable()
export class PriceCalculatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(tenantId: string): Promise<PriceCalculatorState> {
    const [config, fixedCosts] = await Promise.all([
      this.prisma.priceCalculatorConfig.findUnique({ where: { tenantId } }),
      this.prisma.priceCalcFixedCost.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const base: PriceCalculatorConfig = config
      ? {
          fixedCosts: fixedCosts.map((cost) => ({
            id: cost.id,
            name: cost.name,
            amountCents: cost.amountCents,
          })),
          custoVariavelCents: config.custoVariavelCents,
          comissaoMediaBps: config.comissaoMediaBps,
          atendimentosMes: config.atendimentosMes,
          margemBps: config.margemBps,
          precoPraticadoCents: config.precoPraticadoCents,
        }
      : await this.seedFromTenantData(tenantId);

    return { ...base, result: computePriceCalculator(base) };
  }

  async update(
    tenantId: string,
    dto: UpdatePriceCalculatorDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<PriceCalculatorState> {
    const data = {
      custoVariavelCents: dto.custoVariavelCents,
      comissaoMediaBps: dto.comissaoMediaBps,
      atendimentosMes: dto.atendimentosMes,
      margemBps: dto.margemBps,
      precoPraticadoCents: dto.precoPraticadoCents,
    };

    // A lista chega inteira e substitui a anterior — é o que a coluna da
    // esquerda edita: renomear, mudar valor, remover e acrescentar linhas de
    // uma vez. Um `PATCH` por linha faria a tela disparar seis chamadas para
    // cada slider parado.
    await this.prisma.$transaction(async (tx) => {
      await tx.priceCalculatorConfig.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
      await tx.priceCalcFixedCost.deleteMany({ where: { tenantId } });
      if (dto.fixedCosts.length > 0) {
        await tx.priceCalcFixedCost.createMany({
          data: dto.fixedCosts.map((cost, index) => ({
            tenantId,
            name: cost.name.trim(),
            amountCents: cost.amountCents,
            sortOrder: index,
          })),
        });
      }
    });

    await this.audit.record(
      {
        action: AuditAction.PRICE_CALCULATOR_UPDATED,
        entity: 'PriceCalculatorConfig',
        entityId: tenantId,
        tenantId,
        actorUserId,
        metadata: { fixedCosts: dto.fixedCosts.length },
      },
      request,
    );

    return this.get(tenantId);
  }

  /** Primeiro acesso: valores de partida tirados da barbearia, não do desenho. */
  private async seedFromTenantData(tenantId: string): Promise<PriceCalculatorConfig> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [rules, doneLast30, services] = await Promise.all([
      this.prisma.commissionRule.findMany({
        where: { tenantId, active: true },
        select: {
          type: true,
          percentBps: true,
          tiers: { select: { percentBps: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      }),
      this.prisma.appointment.count({
        where: { tenantId, status: AppointmentStatus.DONE, startsAt: { gte: since } },
      }),
      this.prisma.service.findMany({
        where: { tenantId, deletedAt: null, active: true },
        select: { priceCents: true },
      }),
    ]);

    const percents = rules.map((rule) =>
      rule.type === CommissionRuleType.FIXED
        ? (rule.percentBps ?? 0)
        : (rule.tiers[0]?.percentBps ?? 0),
    );
    const comissaoMediaBps =
      percents.length > 0
        ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length)
        : 0;

    // O slider não desce abaixo de 100 nem passa de 1200 (protótipo l.1897) —
    // uma barbearia nova, com 0 atendimentos fechados, precisa cair DENTRO da
    // faixa ou o controle abriria travado num valor que ele não representa.
    const atendimentosMes = Math.min(
      PRICE_CALC_LIMITS.atendimentosMax,
      Math.max(PRICE_CALC_LIMITS.atendimentosMin, doneLast30),
    );

    const precoPraticadoCents =
      services.length > 0
        ? Math.round(
            services.reduce((sum, service) => sum + service.priceCents, 0) / services.length,
          )
        : 0;

    return {
      fixedCosts: [],
      custoVariavelCents: 0,
      comissaoMediaBps,
      atendimentosMes,
      // 20% é o padrão de produto para "margem desejada" — não há de onde
      // deduzir a ambição de lucro de uma barbearia que nunca preencheu isto.
      margemBps: 2000,
      precoPraticadoCents,
    };
  }
}
