import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';

/**
 * `maxBarbeiros` do plano contratado — gate SEMPRE server-side (`SPEC.md`).
 *
 * Tenant em TRIAL (`planId` nulo) não tem plano contratado ainda; a decisão
 * registrada na fase 04/05 é "trial libera tudo", e a contratação de verdade é
 * tela da fase 07/08 — então aqui também não há limite antes da assinatura.
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanAddBarber(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { plan: { select: { maxBarbers: true, name: true } } },
    });

    if (!tenant?.plan || tenant.plan.maxBarbers === null) {
      return;
    }

    const [activeBarbers, pendingInvites] = await Promise.all([
      this.prisma.barber.count({ where: { tenantId, active: true, deletedAt: null } }),
      this.prisma.staffInvite.count({ where: { tenantId, status: 'PENDING' } }),
    ]);

    if (activeBarbers + pendingInvites >= tenant.plan.maxBarbers) {
      throw ApiException.forbidden(
        `O plano ${tenant.plan.name} permite até ${tenant.plan.maxBarbers} barbeiro(s). Faça upgrade para adicionar mais.`,
        'PLAN_LIMIT_REACHED',
      );
    }
  }
}
