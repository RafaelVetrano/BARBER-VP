import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OrderDetail, OrderListResponse, PosCatalogResponse } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { StaffScopeService } from '../staff-agenda/staff-scope.service';
import { OrdersService } from './orders.service';
import {
  AddOrderItemDto,
  ApplyOrderDiscountDto,
  CloseOrderDto,
  OpenOrderDto,
  OrderListQueryDto,
  RedeemOrderLoyaltyDto,
  ReopenOrderDto,
  UpdateOrderItemDto,
} from './dto/pos.dto';

/**
 * Comandas (POS). `BARBER` entra (SPEC: "comandas que atende") mas só vê/mexe
 * nas próprias — `StaffScopeService`, mesmo recorte da agenda interna.
 */
@ApiTags('pos')
@ApiBearerAuth('access-token')
@Controller('orders')
@Roles('OWNER', 'MANAGER', 'BARBER')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly scopes: StaffScopeService,
  ) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Catálogo do balcão (serviços, produtos, barbeiros)' })
  async catalog(@CurrentTenant('id') tenantId: string): Promise<PosCatalogResponse> {
    return this.orders.catalog(tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista comandas (abertas/fechadas)' })
  async list(
    @Query() query: OrderListQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OrderListResponse> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.orders.list(tenantId, scope, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma comanda' })
  async detail(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OrderDetail> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.orders.detail(tenantId, scope, id);
  }

  @Post()
  @ApiOperation({ summary: 'Abre uma comanda (com/sem agendamento, inclui walk-in)' })
  async open(
    @Body() dto: OpenOrderDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OrderDetail> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.orders.open(tenantId, scope, dto, principal.id, request);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Adiciona um item (serviço/produto) à comanda' })
  async addItem(
    @Param('id') id: string,
    @Body() dto: AddOrderItemDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OrderDetail> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.orders.addItem(tenantId, scope, id, dto);
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Atualiza a quantidade de um item' })
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OrderDetail> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.orders.updateItemQuantity(tenantId, scope, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove um item da comanda' })
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OrderDetail> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.orders.removeItem(tenantId, scope, id, itemId);
  }

  @Patch(':id/discount')
  @ApiOperation({ summary: 'Aplica desconto (percentual ou fixo)' })
  async discount(
    @Param('id') id: string,
    @Body() dto: ApplyOrderDiscountDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OrderDetail> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.orders.applyDiscount(tenantId, scope, id, dto);
  }

  @Patch(':id/loyalty')
  @ApiOperation({ summary: 'Liga/desliga o resgate de pontos de fidelidade' })
  async loyalty(
    @Param('id') id: string,
    @Body() dto: RedeemOrderLoyaltyDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OrderDetail> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.orders.redeemLoyalty(tenantId, scope, id, dto);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Fecha a comanda — transação única (pagamentos, estoque, comissão, fidelidade)' })
  async close(
    @Param('id') id: string,
    @Body() dto: CloseOrderDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OrderDetail> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.orders.close(tenantId, scope, id, dto, principal.id, request);
  }

  @Post(':id/reopen')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Reabre uma comanda fechada — só MANAGER+, sempre auditado' })
  async reopen(
    @Param('id') id: string,
    @Body() dto: ReopenOrderDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OrderDetail> {
    return this.orders.reopen(tenantId, id, dto, principal.id, request);
  }
}
