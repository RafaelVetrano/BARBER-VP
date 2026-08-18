import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantStatus } from '@prisma/client';
import { TENANT_HEADER } from '@barbervp/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiException } from '../errors/api.exception';
import { IS_PUBLIC_KEY, TENANT_OPTIONAL_KEY } from '../decorators/public.decorator';
import type { RequestContext, TenantContext } from '../types/request-context';

/**
 * Guard GLOBAL de isolamento de tenant.
 *
 * Resolve o tenant da requisição, nesta ordem:
 *   1. JWT — `principal.activeTenantId`, o tenant que o `POST /auth/login` (ou
 *      o seletor de contexto) gravou no token;
 *   2. slug em rota pública — parâmetro `:slug` da rota ou header
 *      `x-tenant-slug` (usado pelo `apps/booking` em `/{slug}`).
 *
 * Regras:
 *   · Rota sem `@TenantOptional()` que não resolve tenant → 403 TENANT_REQUIRED.
 *   · Principal autenticado pedindo tenant fora dos seus → 403 TENANT_MISMATCH.
 *   · `SUPER_ADMIN` atravessa a fronteira (com auditoria, na fase 08).
 *
 * Nenhum ramo lê `tenantId` do corpo ou da query — é a regra 3 do SPEC, e a
 * suíte de isolamento existe para provar que continua assim.
 *
 * O guard NÃO autentica — quem faz isso é o `JwtAuthGuard`, que roda antes dele
 * na cadeia de `APP_GUARD`. Aqui só cuidamos da fronteira de dados.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const targets = [context.getHandler(), context.getClass()];

    const tenantOptional = this.reflector.getAllAndOverride<boolean>(TENANT_OPTIONAL_KEY, targets);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);

    const tenant = await this.resolveTenant(request);

    if (tenant) {
      this.assertPrincipalMayAccess(request, tenant);
      request.tenant = tenant;
      return true;
    }

    if (tenantOptional) {
      return true;
    }

    // Rota pública sem slug identificável é erro de rota, não de permissão —
    // mas responder 403 evita revelar quais slugs existem.
    void isPublic;
    throw ApiException.tenantRequired();
  }

  private async resolveTenant(request: RequestContext): Promise<TenantContext | null> {
    // 1) JWT — o tenant ativo gravado no token tem precedência sobre o slug:
    // um dono logado no painel não navega para outra barbearia mandando header.
    const principal = request.principal;
    if (principal?.activeTenantId) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: principal.activeTenantId, deletedAt: null },
        select: { id: true, slug: true, status: true },
      });
      if (tenant) {
        // Backstop da suspensão (fase 08): pega o caso de um token emitido
        // ANTES de o super admin suspender — sem isto, a sessão continuaria
        // válida por até 15min (a duração do access token) depois da
        // suspensão. `SUPER_ADMIN` atravessa (é ele quem suspende/reativa).
        if (tenant.status === TenantStatus.SUSPENDED && !principal.isSuperAdmin) {
          throw ApiException.tenantSuspended();
        }
        return { id: tenant.id, slug: tenant.slug, source: 'jwt' };
      }
    }

    // 2) Slug — parâmetro de rota tem precedência sobre o header.
    const paramSlug = this.readSlugParam(request);
    if (paramSlug) {
      const tenant = await this.findBySlug(paramSlug);
      if (!tenant) {
        throw ApiException.notFound('Barbearia não encontrada.');
      }
      return { ...tenant, source: 'slug-param' };
    }

    const headerSlug = this.readSlugHeader(request);
    if (headerSlug) {
      const tenant = await this.findBySlug(headerSlug);
      if (!tenant) {
        throw ApiException.notFound('Barbearia não encontrada.');
      }
      return { ...tenant, source: 'slug-header' };
    }

    return null;
  }

  private assertPrincipalMayAccess(request: RequestContext, tenant: TenantContext): void {
    const principal = request.principal;
    if (!principal || principal.isSuperAdmin) {
      return;
    }
    // Cliente final é global na plataforma: pode navegar em qualquer barbearia,
    // mas os serviços seguem filtrando os dados dele por `tenantId`.
    if (principal.kind === 'client') {
      return;
    }
    if (!principal.tenantIds.includes(tenant.id)) {
      throw ApiException.tenantMismatch();
    }
  }

  private async findBySlug(slug: string): Promise<{ id: string; slug: string } | null> {
    return this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, slug: true },
    });
  }

  private readSlugParam(request: RequestContext): string | null {
    const params = request.params as Record<string, string | undefined> | undefined;
    return this.sanitizeSlug(params?.['slug'] ?? params?.['tenantSlug']);
  }

  private readSlugHeader(request: RequestContext): string | null {
    const raw = request.headers[TENANT_HEADER];
    return this.sanitizeSlug(Array.isArray(raw) ? raw[0] : raw);
  }

  /** Slug é `[a-z0-9-]` — recusar o resto evita busca com lixo no banco. */
  private sanitizeSlug(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const slug = value.trim().toLowerCase();
    return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? slug : null;
  }
}
