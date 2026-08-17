import type { Request } from 'express';
import type { Role, TokenAudience } from '@barbervp/types';

/** Identidade autenticada, montada pelo `JwtAuthGuard` a partir do access token. */
export interface AuthPrincipal {
  /** `User.id` (estabelecimento/super admin) ou `Client.id` (cliente final). */
  id: string;
  kind: 'user' | 'client';
  audience: TokenAudience;
  /** Papéis NO tenant ativo. Cliente carrega sempre `['CLIENT']`. */
  roles: Role[];
  /**
   * Tenant ativo da sessão, vindo do token — a única fonte de tenant para um
   * principal de estabelecimento. `null` quando o dono ainda não escolheu
   * contexto (login com N barbearias) ou quando é super admin fora de tenant.
   */
  activeTenantId: string | null;
  /**
   * Tenants a que o principal pertence (via `Membership`). Mantido para o
   * `TenantGuard` recusar cedo um slug fora do conjunto.
   */
  tenantIds: string[];
  isSuperAdmin: boolean;
  /** `AuthSession.id` que emitiu o token — permite revogar em logout. */
  sessionId: string;
}

/** Tenant resolvido para a requisição corrente. */
export interface TenantContext {
  id: string;
  slug: string;
  /** Como o tenant foi identificado — útil para auditoria e debug. */
  source: 'jwt' | 'slug-header' | 'slug-param';
}

export interface RequestContext extends Request {
  requestId: string;
  principal?: AuthPrincipal;
  tenant?: TenantContext;
}
