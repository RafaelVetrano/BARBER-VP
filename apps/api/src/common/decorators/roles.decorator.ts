import { SetMetadata } from '@nestjs/common';
import type { Role } from '@barbervp/types';

export const ROLES_KEY = 'bvp:roles';

/**
 * Papéis autorizados no handler/controller. Sem o decorator, qualquer
 * principal autenticado passa (a checagem de tenant continua valendo).
 *
 * @example @Roles('OWNER', 'MANAGER')
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
