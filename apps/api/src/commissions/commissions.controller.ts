import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CommissionPeriodResponse,
  CommissionRuleItem,
  ValeItem,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { StaffScopeService } from '../staff-agenda/staff-scope.service';
import { CommissionsService } from './commissions.service';
import {
  ClosePeriodDto,
  CommissionPeriodQueryDto,
  CreateValeDto,
  UpsertCommissionRuleDto,
} from './dto/commissions.dto';

/**
 * Comissões — atrás de `comissoes` (Profissional+). `BARBER` entra (SPEC:
 * "próprias comissões"), mas só enxerga o extrato/vales de si mesmo — regras
 * e "fechar período" são só `OWNER`/`MANAGER`.
 */
@ApiTags('commissions')
@ApiBearerAuth('access-token')
@Controller('commissions')
@Roles('OWNER', 'MANAGER', 'BARBER')
@RequireFeature('comissoes')
export class CommissionsController {
  constructor(
    private readonly commissions: CommissionsService,
    private readonly scopes: StaffScopeService,
  ) {}

  @Get('rules')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Lista as regras de comissão' })
  async listRules(@CurrentTenant('id') tenantId: string): Promise<CommissionRuleItem[]> {
    return this.commissions.listRules(tenantId);
  }

  @Post('rules')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Cria uma regra de comissão' })
  async createRule(
    @Body() dto: UpsertCommissionRuleDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<CommissionRuleItem> {
    return this.commissions.upsertRule(tenantId, undefined, dto, principal.id, request);
  }

  @Patch('rules/:id')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Atualiza uma regra de comissão' })
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpsertCommissionRuleDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<CommissionRuleItem> {
    return this.commissions.upsertRule(tenantId, id, dto, principal.id, request);
  }

  @Get('period')
  @ApiOperation({ summary: 'Extrato de comissão do período (mês)' })
  async period(
    @Query() query: CommissionPeriodQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<CommissionPeriodResponse> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.commissions.period(tenantId, query.month, scope);
  }

  @Post('period/close')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Fecha o período — trava o cálculo e desconta os vales' })
  async closePeriod(
    @Body() dto: ClosePeriodDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<CommissionPeriodResponse> {
    return this.commissions.closePeriod(tenantId, dto, principal.id, request);
  }

  @Get('vales')
  @Roles('OWNER', 'MANAGER')
  @RequireFeature('vales')
  @ApiOperation({ summary: 'Lista os vales (adiantamentos)' })
  async listVales(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<ValeItem[]> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.commissions.listVales(tenantId, scope);
  }

  @Post('vales')
  @Roles('OWNER', 'MANAGER')
  @RequireFeature('vales')
  @ApiOperation({ summary: 'Registra um vale (adiantamento) para um barbeiro' })
  async createVale(
    @Body() dto: CreateValeDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<ValeItem> {
    return this.commissions.createVale(tenantId, dto, principal.id, request);
  }
}
