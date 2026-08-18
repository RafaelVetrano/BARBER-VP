import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminPlanItem } from '@barbervp/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantOptional } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../../common/types/request-context';
import { AdminPlansService } from './admin-plans.service';
import { UpsertPlanDto } from '../dto/admin.dto';

/** CRUD de `SaasPlan` — só `SUPER_ADMIN`, fora do conceito de tenant. */
@ApiTags('admin-plans')
@ApiBearerAuth('access-token')
@Controller('admin/plans')
@Roles('SUPER_ADMIN')
@TenantOptional()
export class AdminPlansController {
  constructor(private readonly plans: AdminPlansService) {}

  @Get()
  @ApiOperation({ summary: 'Lista todos os planos do SaaS' })
  list(): Promise<AdminPlanItem[]> {
    return this.plans.list();
  }

  @Post()
  @ApiOperation({ summary: 'Cria um plano' })
  create(
    @Body() dto: UpsertPlanDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<AdminPlanItem> {
    return this.plans.upsert(undefined, dto, principal.id, request);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um plano' })
  update(
    @Param('id') id: string,
    @Body() dto: UpsertPlanDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<AdminPlanItem> {
    return this.plans.upsert(id, dto, principal.id, request);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Arquiva um plano (não afeta quem já assina)' })
  async archive(
    @Param('id') id: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<{ archived: true }> {
    await this.plans.archive(id, principal.id, request);
    return { archived: true };
  }
}
