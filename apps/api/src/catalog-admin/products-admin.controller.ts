import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ProductListItem, ProductListResponse } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { RequestContext } from '../common/types/request-context';
import { ProductsAdminService } from './products-admin.service';
import { ProductListQueryDto, RestockProductDto, UpsertProductDto } from './dto/catalog-admin.dto';

@ApiTags('catalog')
@ApiBearerAuth('access-token')
@Controller('products')
@Roles('OWNER', 'MANAGER')
export class ProductsAdminController {
  constructor(private readonly products: ProductsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Lista produtos com busca, filtro e paginação' })
  list(
    @Query() query: ProductListQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<ProductListResponse> {
    return this.products.list(tenantId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um produto' })
  create(
    @Body() dto: UpsertProductDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ProductListItem> {
    return this.products.create(tenantId, dto, actorUserId, request);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um produto' })
  update(
    @Param('id') id: string,
    @Body() dto: UpsertProductDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ProductListItem> {
    return this.products.update(tenantId, id, dto, actorUserId, request);
  }

  @Post(':id/restock')
  @ApiOperation({ summary: 'Repõe estoque — soma unidades ao saldo atual' })
  restock(
    @Param('id') id: string,
    @Body() dto: RestockProductDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ProductListItem> {
    return this.products.restock(tenantId, id, dto, actorUserId, request);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Exclui um produto (soft-delete — o histórico continua legível)' })
  remove(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<void> {
    return this.products.remove(tenantId, id, actorUserId, request);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Reativa um produto' })
  activate(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ProductListItem> {
    return this.products.setActive(tenantId, id, true, actorUserId, request);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desativa um produto' })
  deactivate(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ProductListItem> {
    return this.products.setActive(tenantId, id, false, actorUserId, request);
  }
}
