import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  BarbershopSettings,
  CurrentPlanResponse,
  PreferencesSettings,
  PriceCalculatorResult,
  UnitItem,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { SettingsService } from './settings.service';
import {
  ChangePlanDto,
  PriceCalculatorDto,
  UpdateBarbershopSettingsDto,
  UpdatePreferencesDto,
  UpsertUnitDto,
} from './dto/settings.dto';

@ApiTags('settings')
@ApiBearerAuth('access-token')
@Controller('settings')
@Roles('OWNER', 'MANAGER')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // ── Barbearia ────────────────────────────────────────────────────────────

  @Get('barbershop')
  @ApiOperation({ summary: 'Dados da barbearia' })
  async barbershop(@CurrentTenant('id') tenantId: string): Promise<BarbershopSettings> {
    return this.settings.barbershop(tenantId);
  }

  @Patch('barbershop')
  @ApiOperation({ summary: 'Atualiza os dados da barbearia' })
  async updateBarbershop(
    @Body() dto: UpdateBarbershopSettingsDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<BarbershopSettings> {
    return this.settings.updateBarbershop(tenantId, dto, principal.id, request);
  }

  // ── Unidades (Avançado) ──────────────────────────────────────────────────

  @Get('units')
  @RequireFeature('multiUnidades')
  @ApiOperation({ summary: 'Lista as unidades' })
  async units(@CurrentTenant('id') tenantId: string): Promise<UnitItem[]> {
    return this.settings.listUnits(tenantId);
  }

  @Post('units')
  @RequireFeature('multiUnidades')
  @ApiOperation({ summary: 'Cria uma unidade' })
  async createUnit(
    @Body() dto: UpsertUnitDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<UnitItem> {
    return this.settings.createUnit(tenantId, dto, principal.id, request);
  }

  @Patch('units/:id')
  @RequireFeature('multiUnidades')
  @ApiOperation({ summary: 'Atualiza uma unidade' })
  async updateUnit(
    @Param('id') id: string,
    @Body() dto: UpsertUnitDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<UnitItem> {
    return this.settings.updateUnit(tenantId, id, dto, principal.id, request);
  }

  // ── Plano ────────────────────────────────────────────────────────────────

  @Get('plan')
  @ApiOperation({ summary: 'Plano atual, faturas e planos disponíveis' })
  async plan(@CurrentTenant('id') tenantId: string): Promise<CurrentPlanResponse> {
    return this.settings.currentPlan(tenantId);
  }

  @Post('plan/change')
  @ApiOperation({ summary: 'Troca de plano' })
  async changePlan(
    @Body() dto: ChangePlanDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<CurrentPlanResponse> {
    return this.settings.changePlan(tenantId, dto, principal.id, request);
  }

  // ── Preferências ─────────────────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({ summary: 'Preferências de agendamento' })
  async preferences(@CurrentTenant('id') tenantId: string): Promise<PreferencesSettings> {
    return this.settings.preferences(tenantId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Atualiza as preferências de agendamento' })
  async updatePreferences(
    @Body() dto: UpdatePreferencesDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<PreferencesSettings> {
    return this.settings.updatePreferences(tenantId, dto, principal.id, request);
  }

  // ── Calculadora de preço inteligente (Avançado) ─────────────────────────

  @Post('price-calculator')
  @RequireFeature('calculadoraPreco')
  @ApiOperation({ summary: 'Sugere um preço de serviço a partir de custo/margem' })
  priceCalculator(@Body() dto: PriceCalculatorDto): PriceCalculatorResult {
    return this.settings.priceCalculator(dto);
  }
}
