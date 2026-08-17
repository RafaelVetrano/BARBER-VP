import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ServiceListItem, ServiceListResponse } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { RequestContext } from '../common/types/request-context';
import { ServicesAdminService } from './services-admin.service';
import { ServiceListQueryDto, UpsertServiceDto } from './dto/catalog-admin.dto';

@ApiTags('catalog')
@ApiBearerAuth('access-token')
@Controller('services')
@Roles('OWNER', 'MANAGER')
export class ServicesAdminController {
  constructor(private readonly services: ServicesAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Lista serviços com busca, filtro e paginação' })
  list(
    @Query() query: ServiceListQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<ServiceListResponse> {
    return this.services.list(tenantId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um serviço' })
  create(
    @Body() dto: UpsertServiceDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ServiceListItem> {
    return this.services.create(tenantId, dto, actorUserId, request);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um serviço' })
  update(
    @Param('id') id: string,
    @Body() dto: UpsertServiceDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ServiceListItem> {
    return this.services.update(tenantId, id, dto, actorUserId, request);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Reativa um serviço' })
  activate(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ServiceListItem> {
    return this.services.setActive(tenantId, id, true, actorUserId, request);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desativa um serviço (some do booking, mantém o histórico)' })
  deactivate(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ServiceListItem> {
    return this.services.setActive(tenantId, id, false, actorUserId, request);
  }
}
