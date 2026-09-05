import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  StaffAgendaMonthResponse,
  StaffAgendaResponse,
  StaffAgendaSlotsResponse,
  StaffAppointmentDetail,
  StaffAppointmentItem,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { StaffAppointmentsService } from './staff-appointments.service';
import { StaffScopeService } from './staff-scope.service';
import {
  CancelStaffAppointmentDto,
  CreateStaffAgendaBlockDto,
  CreateStaffAppointmentDto,
  MoveStaffAppointmentDto,
  StaffAgendaMonthQueryDto,
  StaffAgendaQueryDto,
  StaffAgendaSlotsQueryDto,
} from './dto/staff-agenda.dto';

/**
 * Agenda interna do dashboard.
 *
 * `BARBER` entra aqui (ao contrário de clientes/catálogo/equipe): é o mesmo
 * endpoint do `Dashboard` e do `DashboardFuncionario` — o recorte por papel
 * acontece dentro do serviço, via `StaffScopeService`, nunca duplicando rota.
 */
@ApiTags('staff-agenda')
@ApiBearerAuth('access-token')
@Controller('staff-agenda')
@Roles('OWNER', 'MANAGER', 'BARBER')
export class StaffAgendaController {
  constructor(
    private readonly appointments: StaffAppointmentsService,
    private readonly scopes: StaffScopeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Agenda por dia, semana ou timeline' })
  async getAgenda(
    @Query() query: StaffAgendaQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<StaffAgendaResponse> {
    const timezone = await this.appointments.timezoneOf(tenantId);
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.getAgenda(tenantId, timezone, query, scope);
  }

  @Get('month')
  @ApiOperation({ summary: 'Visão de mês — contagem e ocupação por dia' })
  async getMonth(
    @Query() query: StaffAgendaMonthQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<StaffAgendaMonthResponse> {
    const timezone = await this.appointments.timezoneOf(tenantId);
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.getMonth(tenantId, timezone, query, scope);
  }

  @Get('slots')
  @ApiOperation({ summary: 'Horários do dia para o modal — livres e ocupados' })
  async getSlots(
    @Query() query: StaffAgendaSlotsQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<StaffAgendaSlotsResponse> {
    const timezone = await this.appointments.timezoneOf(tenantId);
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.getSlots(tenantId, timezone, query, scope);
  }

  @Post('blocks')
  @ApiOperation({ summary: 'Bloqueia uma faixa da agenda (almoço, folga, manutenção)' })
  async createBlock(
    @Body() dto: CreateStaffAgendaBlockDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ) {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.createBlock(tenantId, dto, scope, principal.id, request);
  }

  @Delete('blocks/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove um bloqueio de horário' })
  async deleteBlock(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<void> {
    const scope = await this.scopes.resolve(tenantId, principal);
    await this.appointments.deleteBlock(tenantId, id, scope, principal.id, request);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do drawer — agendamento + últimas visitas' })
  async getDetail(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<StaffAppointmentDetail> {
    const timezone = await this.appointments.timezoneOf(tenantId);
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.getDetail(tenantId, timezone, id, scope);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um agendamento pelo staff (inclui walk-in)' })
  async create(
    @Body() dto: CreateStaffAppointmentDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const timezone = await this.appointments.timezoneOf(tenantId);
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.create(tenantId, timezone, dto, scope, principal.id, request);
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Move (remarca) um agendamento' })
  async move(
    @Param('id') id: string,
    @Body() dto: MoveStaffAppointmentDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const timezone = await this.appointments.timezoneOf(tenantId);
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.move(tenantId, timezone, id, dto, scope, principal.id, request);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirma um agendamento pelo balcão' })
  async confirm(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.confirm(tenantId, id, scope, principal.id, request);
  }

  @Patch(':id/done')
  @ApiOperation({
    summary: 'Conclui o atendimento — sem comanda, sem lançamento financeiro',
  })
  async markDone(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.markDone(tenantId, id, scope, principal.id, request);
  }

  @Patch(':id/no-show')
  @ApiOperation({ summary: 'Marca falta — conta em ClientProfile e pode bloquear o cliente' })
  async markNoShow(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.markNoShow(tenantId, id, scope, principal.id, request);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancela um agendamento' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelStaffAppointmentDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<StaffAppointmentItem> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.appointments.cancel(tenantId, id, dto, scope, principal.id, request);
  }
}
