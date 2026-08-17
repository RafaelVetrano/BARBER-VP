import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, TokenAudience } from '@barbervp/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiException } from '../../common/errors/api.exception';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { AuthPrincipal, RequestContext } from '../../common/types/request-context';
import { AccessTokenService } from '../tokens/access-token.service';
import { SessionService } from '../tokens/session.service';

/**
 * Guard GLOBAL de autenticação — roda ANTES do `TenantGuard` (ver a ordem dos
 * `APP_GUARD` em `app.module.ts`), porque é ele quem preenche
 * `request.principal`, de onde o tenant é resolvido.
 *
 * Em rota `@Public()` o token continua sendo lido quando existe (a página
 * pública da barbearia muda quando o cliente está logado), só não é exigido.
 *
 * Além de conferir a assinatura, confirma que a `AuthSession` continua viva:
 * sem isso, um logout só teria efeito depois de o access token expirar.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const token = this.readBearer(request);
    if (!token) {
      if (isPublic) {
        return true;
      }
      throw ApiException.unauthenticated();
    }

    const principal = await this.resolvePrincipal(token);
    if (!principal) {
      if (isPublic) {
        // Token podre em rota pública não bloqueia: a página segue anônima.
        return true;
      }
      throw ApiException.unauthenticated('Sessão expirada. Entre novamente.');
    }

    request.principal = principal;
    return true;
  }

  private async resolvePrincipal(token: string): Promise<AuthPrincipal | null> {
    const claims = this.accessTokens.verify(token);
    if (!claims) {
      return null;
    }
    if (!(await this.sessions.isActive(claims.sid))) {
      return null;
    }

    if (claims.aud === TokenAudience.CLIENT) {
      const client = await this.prisma.client.findFirst({
        where: { id: claims.sub, deletedAt: null },
        select: { id: true },
      });
      if (!client) {
        return null;
      }
      return {
        id: client.id,
        kind: 'client',
        audience: TokenAudience.CLIENT,
        roles: [Role.CLIENT],
        activeTenantId: null,
        tenantIds: [],
        isSuperAdmin: false,
        sessionId: claims.sid,
      };
    }

    const user = await this.prisma.user.findFirst({
      where: { id: claims.sub, active: true },
      select: {
        id: true,
        isSuperAdmin: true,
        memberships: {
          where: { active: true, tenant: { deletedAt: null } },
          select: { tenantId: true, role: true },
        },
      },
    });
    if (!user) {
      return null;
    }

    const tenantIds = user.memberships.map((membership) => membership.tenantId);
    // O tenant do token só vale se o vínculo ainda existir — um membership
    // removido tem de derrubar o acesso na hora, sem esperar o token expirar.
    const activeTenantId =
      claims.tid && tenantIds.includes(claims.tid)
        ? claims.tid
        : user.isSuperAdmin
          ? claims.tid
          : null;

    const roles = activeTenantId
      ? user.memberships
          .filter((membership) => membership.tenantId === activeTenantId)
          .map((membership) => membership.role as Role)
      : [];

    if (user.isSuperAdmin) {
      roles.push(Role.SUPER_ADMIN);
    }

    return {
      id: user.id,
      kind: 'user',
      audience: TokenAudience.ESTABLISHMENT,
      roles,
      activeTenantId,
      tenantIds,
      isSuperAdmin: user.isSuperAdmin,
      sessionId: claims.sid,
    };
  }

  private readBearer(request: RequestContext): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
  }
}
