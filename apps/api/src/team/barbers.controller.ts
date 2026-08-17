import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { BarberListItem, ScheduleExceptionItem, WorkScheduleDay } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { RequestContext } from '../common/types/request-context';
import { BarbersService } from './barbers.service';
import {
  CreateBarberDto,
  CreateScheduleExceptionDto,
  UpdateBarberDto,
  UpdateWorkScheduleDto,
} from './dto/team.dto';

/**
 * Equipe — `Barber`, escala semanal e exceções (folga/férias/feriado).
 *
 * `BARBER` não entra: a visão dele é `DashboardFuncionario`, que não tem aba
 * Equipe (`SPEC.md` → RBAC).
 */
@ApiTags('team')
@ApiBearerAuth('access-token')
@Controller('barbers')
@Roles('OWNER', 'MANAGER')
export class BarbersController {
  constructor(private readonly barbers: BarbersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista o time (grid da tela Equipe)' })
  list(@CurrentTenant('id') tenantId: string): Promise<BarberListItem[]> {
    return this.barbers.list(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Adiciona um barbeiro sem login próprio' })
  create(
    @Body() dto: CreateBarberDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<BarberListItem> {
    return this.barbers.create(tenantId, dto, actorUserId, request);
  }

  @Get('exceptions')
  @ApiOperation({ summary: 'Lista folgas/férias/feriados' })
  listExceptions(
    @Query('barberId') barberId: string | undefined,
    @CurrentTenant('id') tenantId: string,
  ): Promise<ScheduleExceptionItem[]> {
    return this.barbers.listScheduleExceptions(tenantId, barberId);
  }

  @Post('exceptions')
  @ApiOperation({ summary: 'Cria uma exceção pontual da agenda' })
  createException(
    @Body() dto: CreateScheduleExceptionDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<ScheduleExceptionItem> {
    return this.barbers.createScheduleException(tenantId, dto, actorUserId, request);
  }

  @Delete('exceptions/:id')
  @ApiOperation({ summary: 'Remove uma exceção' })
  deleteException(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<void> {
    return this.barbers.deleteScheduleException(tenantId, id, actorUserId, request);
  }

  @Get(':id/work-schedule')
  @ApiOperation({ summary: 'Escala semanal do barbeiro' })
  getWorkSchedule(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
  ): Promise<WorkScheduleDay[]> {
    return this.barbers.getWorkSchedule(tenantId, id);
  }

  @Put(':id/work-schedule')
  @ApiOperation({ summary: 'Atualiza a escala semanal (com intervalo de almoço)' })
  updateWorkSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateWorkScheduleDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<WorkScheduleDay[]> {
    return this.barbers.updateWorkSchedule(tenantId, id, dto, actorUserId, request);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza dados, serviços atendidos e ativo/inativo' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBarberDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<BarberListItem> {
    return this.barbers.update(tenantId, id, dto, actorUserId, request);
  }
}
