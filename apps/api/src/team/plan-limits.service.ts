import { Injectable } from '@nestjs/common';
import { MembershipRole, type Prisma } from '@prisma/client';
import type { TeamPlanUsage } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';

/**
 * `maxBarbeiros` do plano contratado — gate SEMPRE server-side (`SPEC.md`).
 *
 * Tenant em TRIAL (`planId` nulo) não tem plano contratado ainda; a decisão
 * registrada na fase 04/05 é "trial libera tudo", e a contratação de verdade é
 * tela da fase 07/08 — então aqui também não há limite antes da assinatura.
 *
 * Duas regras que a auditoria da aba Equipe (agente 24) acrescentou:
 *
 * 1. Convite PENDENTE ocupa vaga desde que é criado **e continua ocupando até
 *    ser aceito** — por isso o teto é reconferido no aceite (`assertCanAccept`).
 *    Sem isso, dois convites emitidos com uma vaga sobrando entrariam os dois.
 * 2. Downgrade não é mais recusado: `applyPlanLimit` desliga os excedentes
 *    marcando `inactiveByPlan`, e o upgrade os traz de volta.
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** O cabeçalho "Barbeiros: X de Y" e o banner de downgrade da aba Equipe. */
  async usage(tenantId: string): Promise<TeamPlanUsage> {
    const [tenant, activeBarbers, pendingInvites, inactiveByPlan] = await Promise.all([
      this.prisma.tenant.findFirst({
        where: { id: tenantId },
        select: { plan: { select: { maxBarbers: true, name: true } } },
      }),
      this.prisma.barber.count({ where: { tenantId, active: true, deletedAt: null } }),
      this.prisma.staffInvite.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.barber.findMany({
        where: { tenantId, inactiveByPlan: true, deletedAt: null },
        select: { name: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const maxBarbers = tenant?.plan?.maxBarbers ?? null;

    return {
      activeBarbers,
      pendingInvites,
      maxBarbers,
      planName: tenant?.plan?.name ?? null,
      canAddBarber: maxBarbers === null || activeBarbers + pendingInvites < maxBarbers,
      inactiveByPlanNames: inactiveByPlan.map((barber) => barber.name),
    };
  }

  /** Convite novo, barbeiro novo ou REATIVAÇÃO — os três disputam a mesma vaga. */
  async assertCanAddBarber(tenantId: string): Promise<void> {
    const usage = await this.usage(tenantId);
    if (usage.canAddBarber) {
      return;
    }
    throw ApiException.forbidden(this.limitMessage(usage), 'PLAN_LIMIT_REACHED');
  }

  /**
   * Teto no momento do ACEITE. O convite que está sendo aceito já não conta
   * como pendente aqui (ele vira barbeiro agora), então a conta é só de
   * ativos — mas ela precisa ser refeita: entre o envio e o aceite o dono pode
   * ter feito downgrade, reativado alguém ou aceitado outro convite.
   */
  async assertCanAcceptInvite(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId },
      select: { plan: { select: { maxBarbers: true, name: true } } },
    });

    const maxBarbers = tenant?.plan?.maxBarbers ?? null;
    if (maxBarbers === null) {
      return;
    }

    const activeBarbers = await tx.barber.count({ where: { tenantId, active: true, deletedAt: null } });
    if (activeBarbers < maxBarbers) {
      return;
    }

    throw ApiException.forbidden(
      `A equipe já está com ${activeBarbers} barbeiro(s) ativo(s), o máximo do plano ${
        tenant?.plan?.name ?? 'contratado'
      }. Peça para a barbearia liberar uma vaga ou fazer upgrade antes de concluir seu cadastro.`,
      'PLAN_LIMIT_REACHED',
    );
  }

  /**
   * Ajusta a equipe ao teto de um plano — chamado na troca de plano.
   *
   * Downgrade: desliga do fim da fila para o começo (maior `sortOrder`
   * primeiro), preservando quem entrou antes, e **nunca** o barbeiro-dono —
   * desligá-lo tiraria da agenda quem administra a barbearia.
   *
   * Upgrade: reativa na ordem inversa, só quem foi desligado pelo plano. Quem
   * o dono desativou na mão continua desativado: o upgrade compra vaga, não
   * desfaz decisão de ninguém.
   */
  async applyPlanLimit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    maxBarbers: number | null,
  ): Promise<void> {
    const [barbers, owners] = await Promise.all([
      tx.barber.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, active: true, inactiveByPlan: true, userId: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      tx.membership
        .findMany({
          where: { tenantId, role: MembershipRole.OWNER, active: true },
          select: { userId: true },
        })
        .then((rows) => new Set(rows.map((row) => row.userId))),
    ]);

    const isOwner = (barber: { userId: string | null }) =>
      barber.userId !== null && owners.has(barber.userId);

    if (maxBarbers === null) {
      const toRestore = barbers.filter((barber) => barber.inactiveByPlan).map((barber) => barber.id);
      if (toRestore.length > 0) {
        await tx.barber.updateMany({
          where: { id: { in: toRestore } },
          data: { active: true, inactiveByPlan: false },
        });
      }
      return;
    }

    // A fila de quem ocupa vaga: ativos primeiro (na ordem de entrada), depois
    // os que o plano desligou — são os candidatos naturais a voltar.
    const queue = [
      ...barbers.filter((barber) => barber.active),
      ...barbers.filter((barber) => !barber.active && barber.inactiveByPlan),
    ];

    const keep = new Set<string>();
    for (const barber of queue) {
      // O dono nunca perde a vaga, mesmo que o teto já tenha estourado.
      if (isOwner(barber) || keep.size < maxBarbers) {
        keep.add(barber.id);
      }
    }

    const toDeactivate = queue.filter((barber) => barber.active && !keep.has(barber.id));
    const toRestore = queue.filter((barber) => !barber.active && keep.has(barber.id));

    if (toDeactivate.length > 0) {
      await tx.barber.updateMany({
        where: { id: { in: toDeactivate.map((barber) => barber.id) } },
        data: { active: false, inactiveByPlan: true },
      });
    }
    if (toRestore.length > 0) {
      await tx.barber.updateMany({
        where: { id: { in: toRestore.map((barber) => barber.id) } },
        data: { active: true, inactiveByPlan: false },
      });
    }
  }

  private limitMessage(usage: TeamPlanUsage): string {
    const pending =
      usage.pendingInvites > 0
        ? ` (${usage.activeBarbers} ativo(s) e ${usage.pendingInvites} convite(s) aguardando cadastro)`
        : '';
    return `O plano ${usage.planName ?? 'contratado'} permite até ${usage.maxBarbers} barbeiro(s)${pending}. Faça upgrade para adicionar mais.`;
  }
}
