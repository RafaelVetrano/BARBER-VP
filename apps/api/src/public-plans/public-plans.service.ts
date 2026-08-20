import { Injectable } from '@nestjs/common';
import { planMarketingFrom } from '@barbervp/types';
import type { PublicSaasPlan } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Planos como a landing de vendas os vê.
 *
 * A landing NUNCA repete preço nem bullet: mudar o Profissional de R$ 89 para
 * R$ 99 no super admin tem de aparecer no site sem deploy. Por isso a leitura
 * é daqui, e por isso a página do Next revalida (ISR) em vez de embutir os
 * números no build para sempre.
 */
@Injectable()
export class PublicPlansService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Só planos ativos, do mais barato ao mais caro.
   *
   * A ordenação é por preço e não por `sortOrder` porque é isso que a landing
   * comunica ("comece no Essencial e evolua"): um plano novo mais caro entra no
   * fim sozinho, sem ninguém lembrar de arrumar `sortOrder` no admin. O
   * desempate por `tier` mantém a ordem estável se dois planos custarem igual.
   */
  async list(): Promise<PublicSaasPlan[]> {
    const plans = await this.prisma.saasPlan.findMany({
      where: { active: true },
      orderBy: [{ priceCents: 'asc' }, { tier: 'asc' }],
      select: {
        code: true,
        name: true,
        priceCents: true,
        isPopular: true,
        maxBarbers: true,
        marketing: true,
      },
    });

    return plans.map((plan) => {
      const marketing = planMarketingFrom(plan.marketing);
      return {
        // `code` e não `id`: é ele que vai no `/cadastro?plano=`, é estável
        // entre ambientes e não vaza o cuid do banco na URL.
        id: plan.code,
        name: plan.name,
        priceCents: plan.priceCents,
        highlight: plan.isPopular,
        baseLabel: marketing?.baseLabel ?? null,
        marketingFeatures: marketing?.features ?? [],
        maxBarbers: plan.maxBarbers,
      };
    });
  }
}
