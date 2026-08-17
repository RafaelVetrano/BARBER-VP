import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClientListItem, ClientListResponse } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { RequestContext } from '../common/types/request-context';
import { ClientsService } from './clients.service';
import { ClientListQueryDto, UpdateClientProfileDto } from './dto/clients.dto';

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
  @ApiOperation({ summary: 'Lista clientes com busca, filtro e paginação' })
  list(
    @Query() query: ClientListQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<ClientListResponse> {
    return this.clients.list(tenantId, query);
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
