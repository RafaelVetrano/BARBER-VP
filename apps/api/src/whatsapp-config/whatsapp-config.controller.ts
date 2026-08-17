import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WhatsappEvent } from '@prisma/client';
import type { WhatsappAutomationItem } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { WhatsappConfigService } from './whatsapp-config.service';
import { UpdateWhatsappAutomationDto } from './dto/whatsapp-config.dto';

/**
 * WhatsApp — liberado em todo plano (lembrete/confirmação/cancelamento);
 * ligar aniversário/reativação/avaliação exige `whatsappCompleto`
 * (Profissional+), checado por evento no service, não no controller inteiro.
 */
@ApiTags('whatsapp-config')
@ApiBearerAuth('access-token')
@Controller('whatsapp-config')
@Roles('OWNER', 'MANAGER')
export class WhatsappConfigController {
  constructor(private readonly automations: WhatsappConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as automações de WhatsApp' })
  async list(@CurrentTenant('id') tenantId: string): Promise<WhatsappAutomationItem[]> {
    return this.automations.list(tenantId);
  }

  @Patch(':event')
  @ApiOperation({ summary: 'Liga/desliga ou edita o template de uma automação' })
  async update(
    @Param('event') event: WhatsappEvent,
    @Body() dto: UpdateWhatsappAutomationDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<WhatsappAutomationItem> {
    return this.automations.update(tenantId, event, dto, principal.id, request);
  }
}
