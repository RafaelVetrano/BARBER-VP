import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { StaffAgendaResponse, StaffAppointmentItem } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { StaffAppointmentsService } from './staff-appointments.service';
import { StaffScopeService } from './staff-scope.service';
import {
  CancelStaffAppointmentDto,
  CreateStaffAppointmentDto,
  MoveStaffAppointmentDto,
  StaffAgendaQueryDto,
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
