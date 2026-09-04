import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WhatsappEvent } from '@prisma/client';
import type {
  WhatsappAutomationItem,
  WhatsappAutomationsResponse,
  WhatsappConnection,
  WhatsappHistoryPage,
  WhatsappReactivationResult,
  WhatsappReactivationSummary,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { WhatsappConfigService } from './whatsapp-config.service';
import { UpdateWhatsappAutomationDto, WhatsappHistoryQueryDto } from './dto/whatsapp-config.dto';

/**
 * Aba WhatsApp — `Dashboard.dc.html` l.1624–1722.
 *
 * `@Roles('OWNER','MANAGER')`: o `DashboardFuncionario.dc.html` não tem esta
 * tela, então `BARBER` não a vê no nav E toma 403 se digitar a URL.
 *
 * A aba inteira é liberada em todo plano (lembrete/confirmação/cancelamento);
 * o que exige `whatsappCompleto` (Profissional+) é ligar ou editar
 * aniversário/reativação/avaliação e disparar a reativação em massa — checado
 * POR EVENTO no service, não no controller inteiro: LER a lista sempre
 * funciona, senão a tela não teria o que trancar com cadeado.
 */
@ApiTags('whatsapp-config')
@ApiBearerAuth('access-token')
@Controller('whatsapp-config')
@Roles('OWNER', 'MANAGER')
export class WhatsappConfigController {
  constructor(private readonly automations: WhatsappConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as 6 automações de WhatsApp, na ordem da tela' })
  async list(@CurrentTenant('id') tenantId: string): Promise<WhatsappAutomationsResponse> {
    return this.automations.list(tenantId);
  }

  /**
   * Registrado ANTES de `:event` não por necessidade (os verbos e as rotas não
   * colidem — só existe `PATCH :event`), mas para que continuem assim se um
   * `GET :event` aparecer depois.
   */
  @Get('connection')
  @ApiOperation({ summary: 'Estado do canal de envio (card "Conexão com WhatsApp")' })
  async connection(@CurrentTenant('id') tenantId: string): Promise<WhatsappConnection> {
    return this.automations.connection(tenantId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Histórico de envios — `NotificationOutbox` desta barbearia' })
  async history(
    @Query() query: WhatsappHistoryQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<WhatsappHistoryPage> {
    return this.automations.history(tenantId, query);
  }

  @Get('reactivation')
  @ApiOperation({ summary: 'Clientes inativos na janela configurada (faixa de reativação)' })
  async reactivation(
    @CurrentTenant('id') tenantId: string,
  ): Promise<WhatsappReactivationSummary> {
    return this.automations.reactivationSummary(tenantId);
  }

  @Post('reactivation/send')
  @ApiOperation({ summary: 'Dispara a reativação em massa (403 sem `whatsappCompleto`)' })
  async sendReactivation(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<WhatsappReactivationResult> {
    return this.automations.sendReactivation(tenantId, principal.id, request);
  }

  @Patch(':event')
  @ApiOperation({ summary: 'Liga/desliga, ajusta o disparo ou edita o template de uma automação' })
  async update(
    // Sem o pipe, um evento inventado na URL viraria erro de Prisma (500) em
    // vez do 400 que ele é.
    @Param('event', new ParseEnumPipe(WhatsappEvent)) event: WhatsappEvent,
    @Body() dto: UpdateWhatsappAutomationDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<WhatsappAutomationItem> {
    return this.automations.update(tenantId, event, dto, principal.id, request);
  }
}
