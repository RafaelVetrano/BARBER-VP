import { Body, Controller, Get, Header, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type {
  BarbershopSettings,
  CurrentPlanResponse,
  PlanChangePreview,
  PreferencesSettings,
  UnitItem,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { SettingsService } from './settings.service';
import {
  ChangePlanDto,
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

  // ── Unidades ─────────────────────────────────────────────────────────────
  //
  // A LEITURA é livre; o gate `multiUnidades` (Avançado) está nas ESCRITAS.
  //
  // Antes o `GET` também era gated, e a consequência era que a sub-aba
  // "Unidades" inteira virava um paywall fora do plano. O protótipo faz o
  // oposto: a lista aparece e o cadeado fica no item "+ Nova unidade"
  // (topbar, l.102–106) — o dono vê o que tem hoje e entende exatamente o que
  // o upgrade compra. Quem decide continua sendo o servidor: `POST`/`PATCH`
  // respondem 403 sem o plano, e é isso que a suíte de isolamento verifica.

  @Get('units')
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

  // ── Plano e cobrança (só o dono) ─────────────────────────────────────────
  //
  // `SPEC.md` → RBAC: "MANAGER: dashboard completo EXCETO configurações de
  // billing/plano do SaaS". O gerente administra a barbearia; contratar,
  // trocar e pagar a assinatura é do dono. Estava aberto aos dois — um gerente
  // podia fazer downgrade e desligar barbeiros.

  @Get('plan')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Plano atual, faturas e planos disponíveis' })
  async plan(@CurrentTenant('id') tenantId: string): Promise<CurrentPlanResponse> {
    return this.settings.currentPlan(tenantId);
  }

  @Get('plan/preview/:planId')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Ganhos e perdas da troca — o corpo do `modalTrocarPlano`' })
  async planPreview(
    @Param('planId') planId: string,
    @CurrentTenant('id') tenantId: string,
  ): Promise<PlanChangePreview> {
    return this.settings.previewPlanChange(tenantId, planId);
  }

  @Post('plan/change')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Troca de plano' })
  async changePlan(
    @Body() dto: ChangePlanDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<CurrentPlanResponse> {
    return this.settings.changePlan(tenantId, dto, principal.id, request);
  }

  @Get('plan/invoices/:id.pdf')
  @Roles('OWNER')
  @Header('Cache-Control', 'no-store')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Recibo de uma fatura — o link "PDF" do histórico' })
  async invoicePdf(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.settings.invoicePdf(tenantId, id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.setHeader('Content-Length', file.body.length);
    response.end(file.body);
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

  // A calculadora de preço saiu daqui: o protótipo a desenha na aba "Serviços
  // & Produtos" (l.1856), e é lá que ela vive agora — `PriceCalculatorController`.
}
