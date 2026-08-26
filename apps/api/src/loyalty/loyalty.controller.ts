import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClientPlanAdminItem, LoyaltyProgramConfig, SubscriberItem } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { LoyaltyService } from './loyalty.service';
import { UpdateLoyaltyProgramDto, UpsertClientPlanDto } from './dto/loyalty.dto';

/**
 * Fidelidade. A aba do painel mostra **só Assinaturas** — as sub-abas "Pontos"
 * e "Sorteios" saíram do protótipo na revisão do agente 21, e com elas foram
 * `GET /loyalty/clients` e toda a família `/loyalty/raffles`.
 *
 * `/loyalty/program` sobreviveu sem tela: o programa de pontos continua sendo
 * lido pela comanda (resgate) e pela aba Clientes (saldo). Ver dívida no
 * CONTEXT — a configuração precisa de um lugar em Configurações.
 */
@ApiTags('loyalty')
@ApiBearerAuth('access-token')
@Controller('loyalty')
@Roles('OWNER', 'MANAGER')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  // ── Programa de pontos ───────────────────────────────────────────────────

  @Get('program')
  @RequireFeature('fidelidadePontos')
  @ApiOperation({ summary: 'Configuração do programa de pontos' })
  async program(@CurrentTenant('id') tenantId: string): Promise<LoyaltyProgramConfig> {
    return this.loyalty.programConfig(tenantId);
  }

  @Patch('program')
  @RequireFeature('fidelidadePontos')
  @ApiOperation({ summary: 'Atualiza a configuração do programa de pontos' })
  async updateProgram(
    @Body() dto: UpdateLoyaltyProgramDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<LoyaltyProgramConfig> {
    return this.loyalty.updateProgram(tenantId, dto, principal.id, request);
  }

  // ── Planos de assinatura (Avançado) ─────────────────────────────────────

  @Get('plans')
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Planos de assinatura vendidos pela barbearia' })
  async plans(@CurrentTenant('id') tenantId: string): Promise<ClientPlanAdminItem[]> {
    return this.loyalty.listPlans(tenantId);
  }

  @Post('plans')
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Cria um plano de assinatura' })
  async createPlan(
    @Body() dto: UpsertClientPlanDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<ClientPlanAdminItem> {
    return this.loyalty.upsertPlan(tenantId, undefined, dto, principal.id, request);
  }

  @Patch('plans/:id')
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Atualiza um plano de assinatura' })
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: UpsertClientPlanDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<ClientPlanAdminItem> {
    return this.loyalty.upsertPlan(tenantId, id, dto, principal.id, request);
  }

  @Patch('plans/:id/archive')
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Arquiva um plano (some da vitrine, mantém assinantes)' })
  async archivePlan(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<ClientPlanAdminItem> {
    return this.loyalty.archivePlan(tenantId, id, principal.id, request);
  }

  @Patch('plans/:id/reactivate')
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Reativa um plano arquivado' })
  async reactivatePlan(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<ClientPlanAdminItem> {
    return this.loyalty.reactivatePlan(tenantId, id, principal.id, request);
  }

  @Delete('plans/:id')
  @HttpCode(204)
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Exclui um plano que nunca teve assinante (409 se teve)' })
  async deletePlan(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<void> {
    await this.loyalty.deletePlan(tenantId, id, principal.id, request);
  }

  // ── Assinantes ───────────────────────────────────────────────────────────

  @Get('subscribers')
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Assinantes com uso do ciclo e situação de pagamento' })
  async subscribers(@CurrentTenant('id') tenantId: string): Promise<SubscriberItem[]> {
    return this.loyalty.subscribers(tenantId);
  }

  @Patch('subscribers/:id/pause')
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Pausa a assinatura de um cliente' })
  async pauseSubscriber(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<SubscriberItem> {
    return this.loyalty.pauseSubscriber(tenantId, id, principal.id, request);
  }

  @Patch('subscribers/:id/resume')
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Retoma uma assinatura pausada' })
  async resumeSubscriber(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<SubscriberItem> {
    return this.loyalty.resumeSubscriber(tenantId, id, principal.id, request);
  }

  @Patch('subscribers/:id/cancel')
  @HttpCode(204)
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Cancela a assinatura de um cliente' })
  async cancelSubscriber(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<void> {
    await this.loyalty.cancelSubscriber(tenantId, id, principal.id, request);
  }
}
