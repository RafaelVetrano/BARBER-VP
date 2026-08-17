import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  ClientAppointmentItem,
  ClientAppointmentsResponse,
  ClientPlanDetail,
  ClientSubscriptionAccount,
  ClientSubscriptionDetail,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { RequestContext } from '../common/types/request-context';
import { ClientAppointmentsService } from './client-appointments.service';
import { ClientSubscriptionService } from './client-subscription.service';
import { RateAppointmentDto, SubscribeDto } from './dto/client-account.dto';

/**
 * `MinhaConta` — agendamentos e assinatura do cliente logado, escopados à
 * barbearia da URL (`/public/:slug/account/*`).
 *
 * Sem `@Public()`: o `JwtAuthGuard` já exige Bearer por padrão, e `@Roles('CLIENT')`
 * garante que um dono logado no painel (audiência `bvp:establishment`) não entra
 * aqui por engano. O `TenantGuard` resolve o tenant pelo `:slug`, exatamente
 * como o resto do booking público — `assertPrincipalMayAccess` já libera
 * cliente para qualquer barbearia, porque a conta é global.
 */
@ApiTags('client-account')
@ApiBearerAuth('access-token')
@Roles('CLIENT')
@Controller('public/:slug/account')
export class ClientAccountController {
  constructor(
    private readonly appointments: ClientAppointmentsService,
    private readonly subscriptions: ClientSubscriptionService,
  ) {}

  // ── Agendamentos ───────────────────────────────────────────────────────────

  @Get('appointments')
  @ApiOperation({ summary: 'Próximos e histórico do cliente logado, nesta barbearia' })
  listAppointments(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') clientId: string,
  ): Promise<ClientAppointmentsResponse> {
    return this.appointments.list(tenantId, clientId);
  }

  @Post('appointments/:id/rate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Avalia um atendimento concluído (1 a 5 estrelas)' })
  rateAppointment(
    @Param('id') appointmentId: string,
    @Body() dto: RateAppointmentDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') clientId: string,
    @Req() request: RequestContext,
  ): Promise<ClientAppointmentItem> {
    return this.appointments.rate(tenantId, clientId, appointmentId, dto, request);
  }

  // ── Assinatura ───────────────────────────────────────────────────────────

  @Get('subscription/plans')
  @ApiOperation({ summary: 'Planos de assinatura ativos desta barbearia' })
  plans(@CurrentTenant('id') tenantId: string): Promise<ClientPlanDetail[]> {
    return this.subscriptions.plans(tenantId);
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Assinatura atual (se houver) + histórico de cobranças' })
  current(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') clientId: string,
  ): Promise<ClientSubscriptionAccount> {
    return this.subscriptions.current(tenantId, clientId);
  }

  @Post('subscription')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Assina um plano — cartão ou Pix, ambos simulados' })
  subscribe(
    @Body() dto: SubscribeDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') clientId: string,
    @Req() request: RequestContext,
  ): Promise<ClientSubscriptionDetail> {
    return this.subscriptions.subscribe(tenantId, clientId, dto, request);
  }

  @Post('subscription/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pausa — mantém dados, zera cobrança até reativar' })
  pause(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') clientId: string,
    @Req() request: RequestContext,
  ): Promise<ClientSubscriptionDetail> {
    return this.subscriptions.pause(tenantId, clientId, request);
  }

  @Post('subscription/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reativa uma assinatura pausada' })
  resume(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') clientId: string,
    @Req() request: RequestContext,
  ): Promise<ClientSubscriptionDetail> {
    return this.subscriptions.resume(tenantId, clientId, request);
  }

  @Post('subscription/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela — perde os usos restantes do ciclo, sem multa' })
  cancel(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') clientId: string,
    @Req() request: RequestContext,
  ): Promise<ClientSubscriptionDetail> {
    return this.subscriptions.cancel(tenantId, clientId, request);
  }
}
