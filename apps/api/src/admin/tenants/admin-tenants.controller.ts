import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminTenantDetail, AdminTenantListResponse, ImpersonateResultDto } from '@barbervp/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantOptional } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../../common/types/request-context';
import { AdminTenantsService } from './admin-tenants.service';
import { AdminTenantListQueryDto, ChangeTenantPlanDto } from '../dto/admin.dto';

/** Tenants da plataforma — só `SUPER_ADMIN`, fora do conceito de tenant. */
@ApiTags('admin-tenants')
@ApiBearerAuth('access-token')
@Controller('admin/tenants')
@Roles('SUPER_ADMIN')
@TenantOptional()
export class AdminTenantsController {
  constructor(private readonly tenants: AdminTenantsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista/busca tenants com uso agregado' })
  list(@Query() query: AdminTenantListQueryDto): Promise<AdminTenantListResponse> {
    return this.tenants.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do tenant com métricas' })
  detail(@Param('id') id: string): Promise<AdminTenantDetail> {
    return this.tenants.detail(id);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspende o tenant — bloqueia login de todos os Memberships' })
  async suspend(
    @Param('id') id: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<{ status: 'SUSPENDED' }> {
    await this.tenants.suspend(id, principal.id, request);
    return { status: 'SUSPENDED' };
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reativa o tenant' })
  async reactivate(
    @Param('id') id: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<{ status: 'ACTIVE' }> {
    await this.tenants.reactivate(id, principal.id, request);
    return { status: 'ACTIVE' };
  }

  @Patch(':id/plan')
  @ApiOperation({ summary: 'Troca o plano do tenant manualmente' })
  async changePlan(
    @Param('id') id: string,
    @Body() dto: ChangeTenantPlanDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<{ changed: true }> {
    await this.tenants.changePlan(id, dto, principal.id, request);
    return { changed: true };
  }

  @Post(':id/impersonate')
  @ApiOperation({ summary: 'Impersona o OWNER do tenant — sessão curta, sem refresh, auditoria pesada' })
  impersonate(
    @Param('id') id: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<ImpersonateResultDto> {
    return this.tenants.impersonate(id, principal.id, request);
  }
}
