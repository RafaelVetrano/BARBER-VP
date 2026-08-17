import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'bvp:isPublic';
export const TENANT_OPTIONAL_KEY = 'bvp:tenantOptional';

/**
 * Rota sem autenticação. NÃO desliga o `TenantGuard`: a página pública da
 * barbearia é anônima mas continua escopada por tenant (slug).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Rota que pode rodar sem tenant algum — `/health`, login de estabelecimento,
 * endpoints do super admin. Use com parcimônia: fora destes casos, um endpoint
 * sem tenant é um vazamento em potencial.
 */
export const TenantOptional = () => SetMetadata(TENANT_OPTIONAL_KEY, true);
