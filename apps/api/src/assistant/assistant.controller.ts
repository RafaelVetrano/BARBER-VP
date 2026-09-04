import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AiChatHistoryResponse, AiChatResponse } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal } from '../common/types/request-context';
import { AssistantService } from './assistant.service';
import { SendAiChatMessageDto } from './dto/assistant.dto';

/**
 * Assistente IA ("Navalha") — chat simples, sem gate de feature: a cota mensal
 * por plano já regula o uso, e ela é do TENANT (`AssistantService.usage`).
 *
 * `BARBER` fica de fora porque o `DashboardFuncionario.dc.html` (l.1612) não
 * tem a aba no nav — o assistente fala de faturamento e base de clientes.
 */
@ApiTags('assistant')
@ApiBearerAuth('access-token')
@Controller('assistant')
@Roles('OWNER', 'MANAGER')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('messages')
  @ApiOperation({ summary: 'Histórico do chat, uso do mês e sugestões' })
  async history(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<AiChatHistoryResponse> {
    return this.assistant.history(tenantId, principal.id);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Envia uma mensagem ao assistente' })
  async send(
    @Body() dto: SendAiChatMessageDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<AiChatResponse> {
    return this.assistant.send(tenantId, principal.id, dto.content);
  }

  @Delete('messages')
  @ApiOperation({ summary: 'Limpa a conversa (a cota do mês permanece contada)' })
  async clear(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<AiChatHistoryResponse> {
    return this.assistant.clear(tenantId, principal.id);
  }
}
