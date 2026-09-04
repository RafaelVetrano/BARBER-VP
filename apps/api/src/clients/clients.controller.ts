import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type {
  ClientBulkBlockResult,
  ClientBulkMessageResult,
  ClientDetail,
  ClientListItem,
  ClientListResponse,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { RequestContext } from '../common/types/request-context';
import { ClientsService } from './clients.service';
import {
  ClientBulkBlockDto,
  ClientBulkMessageDto,
  ClientExportQueryDto,
  ClientListQueryDto,
  CreateClientDto,
  UpdateClientProfileDto,
} from './dto/clients.dto';

/**
 * Clientes da barbearia — `ClientProfile` por tenant.
 *
 * `BARBER` não entra aqui (`SPEC.md` → RBAC): a visão dele é a própria agenda,
 * não a base de clientes inteira.
 */
@ApiTags('clients')
@ApiBearerAuth('access-token')
@Controller('clients')
@Roles('OWNER', 'MANAGER')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista clientes com busca, filtro, contagens e paginação' })
  list(
    @Query() query: ClientListQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<ClientListResponse> {
    return this.clients.list(tenantId, query);
  }

  /**
   * Registrada ANTES de `:id` — sem isso, `/clients/export` casaria com a rota
   * de parâmetro e o Nest procuraria um cliente chamado "export".
   */
  @Get('export')
  @ApiOperation({ summary: 'CSV da lista (busca + chip) ou da seleção (`ids`)' })
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="clientes.csv"')
  export(
    @Query() query: ClientExportQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<string> {
    return this.clients.exportCsv(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Perfil completo — KPIs, histórico, fidelidade, assinatura' })
  detail(@Param('id') id: string, @CurrentTenant('id') tenantId: string): Promise<ClientDetail> {
    return this.clients.detail(tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra cliente (balcão ou ficha completa)' })
  create(
    @Body() dto: CreateClientDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ClientListItem> {
    return this.clients.create(tenantId, dto, actorUserId, request);
  }

  @Post('bulk/block')
  @ApiOperation({ summary: 'Bloqueia/libera em lote (barra de seleção)' })
  bulkBlock(
    @Body() dto: ClientBulkBlockDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ClientBulkBlockResult> {
    return this.clients.bulkSetBlocked(tenantId, dto, actorUserId, request);
  }

  @Post('bulk/message')
  @ApiOperation({ summary: 'Dispara mensagem em lote (respeita quem recusou)' })
  bulkMessage(
    @Body() dto: ClientBulkMessageDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ClientBulkMessageResult> {
    return this.clients.bulkMessage(tenantId, dto, actorUserId, request);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza notas e barbeiro favorito' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientProfileDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ClientListItem> {
    return this.clients.update(tenantId, id, dto, actorUserId, request);
  }

  @Patch(':id/block')
  @ApiOperation({ summary: 'Bloqueia o agendamento online deste cliente' })
  block(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ClientListItem> {
    return this.clients.setBlocked(tenantId, id, true, actorUserId, request);
  }

  @Patch(':id/unblock')
  @ApiOperation({ summary: 'Libera o agendamento online deste cliente' })
  unblock(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ClientListItem> {
    return this.clients.setBlocked(tenantId, id, false, actorUserId, request);
  }
}
