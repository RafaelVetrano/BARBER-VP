import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AiChatHistoryResponse, AiChatResponse } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal } from '../common/types/request-context';
import { AssistantService } from './assistant.service';
import { SendAiChatMessageDto } from './dto/assistant.dto';

/** Assistente IA ("Navalha") — chat simples, sem gate de feature (o limite por plano já regula o uso). */
@ApiTags('assistant')
@ApiBearerAuth('access-token')
@Controller('assistant')
@Roles('OWNER', 'MANAGER')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('messages')
  @ApiOperation({ summary: 'Histórico do chat e uso do mês' })
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
}
