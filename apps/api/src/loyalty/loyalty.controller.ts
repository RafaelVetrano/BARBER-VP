import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ClientPlanAdminItem,
  LoyaltyClientBalance,
  LoyaltyProgramConfig,
  RaffleItem,
  SubscriberItem,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { LoyaltyService } from './loyalty.service';
import { CreateRaffleDto, UpdateLoyaltyProgramDto, UpsertClientPlanDto } from './dto/loyalty.dto';

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

  @Get('clients')
  @RequireFeature('fidelidadePontos')
  @ApiOperation({ summary: 'Saldo de pontos por cliente' })
  async clients(@CurrentTenant('id') tenantId: string): Promise<LoyaltyClientBalance[]> {
    return this.loyalty.clientBalances(tenantId);
  }

  // ── Sorteios ─────────────────────────────────────────────────────────────

  @Get('raffles')
  @RequireFeature('fidelidadeSorteios')
  @ApiOperation({ summary: 'Lista sorteios (ativos e encerrados)' })
  async raffles(@CurrentTenant('id') tenantId: string): Promise<RaffleItem[]> {
    return this.loyalty.listRaffles(tenantId);
  }

  @Post('raffles')
  @RequireFeature('fidelidadeSorteios')
  @ApiOperation({ summary: 'Cria um sorteio' })
  async createRaffle(
    @Body() dto: CreateRaffleDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<RaffleItem> {
    return this.loyalty.createRaffle(tenantId, dto, principal.id, request);
  }

  @Post('raffles/:id/draw')
  @RequireFeature('fidelidadeSorteios')
  @ApiOperation({ summary: 'Realiza o sorteio — escolhe o vencedor' })
  async draw(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<RaffleItem> {
    return this.loyalty.drawRaffle(tenantId, id, principal.id, request);
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
  ): Promise<{ archived: true }> {
    await this.loyalty.archivePlan(tenantId, id, principal.id, request);
    return { archived: true };
  }

  @Get('subscribers')
  @RequireFeature('fidelidadeAssinaturas')
  @ApiOperation({ summary: 'Assinantes com uso do ciclo e status de pagamento' })
  async subscribers(@CurrentTenant('id') tenantId: string): Promise<SubscriberItem[]> {
    return this.loyalty.subscribers(tenantId);
  }
}
