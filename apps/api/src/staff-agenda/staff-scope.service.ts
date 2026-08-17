import { Injectable } from '@nestjs/common';
import { Role } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import type { AuthPrincipal } from '../common/types/request-context';

export interface StaffScope {
  /** `null` = OWNER/MANAGER, enxerga a agenda inteira. Preenchido = só este barbeiro. */
  forcedBarberId: string | null;
}

/**
 * Resolve o recorte de dados do papel `BARBER` (`SPEC.md` → RBAC): "o backend
 * filtra por `barberId = membership.barberId` quando o papel é BARBER".
 *
 * Não há esse id no JWT — é resolvido aqui pelo par `(tenantId, userId)`, que
 * é único em `Barber` (`@@unique([tenantId, userId])`). Isso evita reemitir
 * token toda vez que o vínculo de barbeiro muda.
 */
@Injectable()
export class StaffScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(tenantId: string, principal: AuthPrincipal): Promise<StaffScope> {
    const isUnrestricted =
      principal.isSuperAdmin ||
      principal.roles.includes(Role.OWNER) ||
      principal.roles.includes(Role.MANAGER);

    if (isUnrestricted) {
      return { forcedBarberId: null };
    }

    if (!principal.roles.includes(Role.BARBER)) {
      throw ApiException.forbidden();
    }

    const barber = await this.prisma.barber.findUnique({
      where: { tenantId_userId: { tenantId, userId: principal.id } },
      select: { id: true },
    });

    if (!barber) {
      throw ApiException.forbidden('Você não tem uma agenda nesta barbearia.');
    }

    return { forcedBarberId: barber.id };
  }

  /** Papel `BARBER` só age sobre o próprio `barberId` — qualquer outro é 403. */
  assertAllowed(scope: StaffScope, barberId: string): void {
    if (scope.forcedBarberId && scope.forcedBarberId !== barberId) {
      throw ApiException.forbidden('Você só pode gerenciar a própria agenda.');
    }
  }
}
