import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  AppointmentSummary,
  AvailabilityResponse,
  BookingQuote,
  CreateAppointmentResult,
  PublicBarbershop,
} from '@barbervp/types';
import { Public } from '../common/decorators/public.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { PublicPageService } from './public-page.service';
import { AvailabilityService } from './availability.service';
import { CatalogService } from './catalog.service';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentLookupDto,
  AvailabilityQueryDto,
  CancelAppointmentDto,
  ConfirmGuestBookingDto,
  CreateAppointmentDto,
  QuoteQueryDto,
  RescheduleAppointmentDto,
} from './dto/booking.dto';

/**
 * Teto de criação por IP, por hora.
 *
 * Lido de `process.env` e não do `AppConfig` injetado porque `@Throttle` é
 * avaliado quando a classe é definida, antes de existir container de DI. A
 * variável está no `envSchema` (validada e documentada como as demais); o
 * `?? 30` aqui repete o default de lá, e os dois têm de andar juntos.
 *
 * O número é frouxo de propósito: a barreira contra agenda lotada de graça é o
 * OTP condicional do `GuestRiskService`, que olha telefone e comportamento.
 * Teto por IP baixo derrubaria a família inteira agendando do mesmo wi-fi.
 */
const CREATE_HOURLY_LIMIT = Number(process.env['BOOKING_CREATE_HOURLY_LIMIT']) || 30;

/**
 * Booking público — tudo sob `/{slug}`.
 *
 * `@Public()` desliga a exigência de token, NÃO o `TenantGuard`: o `:slug` da
 * rota é o que resolve a barbearia, e todo serviço abaixo filtra por
 * `@CurrentTenant('id')`. Nenhum handler daqui aceita `tenantId` no corpo ou na
 * query — trocar o slug é a única maneira de mudar de barbearia, e trocar o
 * slug muda a barbearia inteira, não um pedaço dela.
 *
 * O token, quando existe, continua sendo lido (o `JwtAuthGuard` faz isso em
 * rota pública): é o que muda "Entrar" por "Meus agendamentos" no cabeçalho e
 * acende o selo "Incluído na assinatura" no wizard.
 *
 * Limites: a criação de agendamento é a rota cara e a que um robô atacaria
 * (lotar a agenda de graça), então tem teto próprio bem abaixo do global.
 */
@ApiTags('booking')
@Public()
@Controller('public/:slug')
export class PublicBookingController {
  constructor(
    private readonly page: PublicPageService,
    private readonly availability: AvailabilityService,
    private readonly catalog: CatalogService,
    private readonly appointments: AppointmentsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Página pública da barbearia',
    description:
      'Serviços, equipe, planos, avaliações e horário de funcionamento numa resposta só.',
  })
  getPage(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal | undefined,
  ): Promise<PublicBarbershop> {
    return this.page.getBySlug(tenantId, clientIdOf(principal));
  }

  @Get('quote')
  @ApiOperation({
    summary: 'Cotação da seleção de serviços',
    description:
      'Aplica o combo, calcula preço e cobertura de assinatura e diz quais barbeiros atendem.',
  })
  quote(
    @Query() query: QuoteQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal | undefined,
  ): Promise<BookingQuote> {
    return this.catalog.quote(tenantId, query.serviceIds, clientIdOf(principal));
  }

  @Get('availability')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Grade de horários',
    description:
      'Chips de dia com indicador de lotação e horários do dia escolhido, agrupáveis por período.',
  })
  async getAvailability(
    @Query() query: AvailabilityQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal | undefined,
  ): Promise<AvailabilityResponse> {
    // O combo entra antes da grade: Corte + Barba dura 70 min, não 75.
    const resolved = await this.catalog.resolveSelection(
      tenantId,
      query.serviceIds,
      clientIdOf(principal),
    );

    return this.availability.getAvailability({
      tenantId,
      serviceIds: resolved.services.map((service) => service.id),
      totalDurationMin: resolved.services.reduce(
        (total, service) => total + service.durationMin,
        0,
      ),
      barberId: query.barberId ?? null,
      fromDate: query.from,
      selectedDate: query.date,
      days: query.days,
    });
  }

  @Post('appointments')
  @Throttle({ default: { limit: CREATE_HOURLY_LIMIT, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Cria o agendamento',
    description:
      'Cliente logado ou visitante. Devolve 409 DOUBLE_BOOKING quando o horário foi tomado.',
  })
  create(
    @Body() dto: CreateAppointmentDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal | undefined,
    @Req() request: RequestContext,
  ): Promise<CreateAppointmentResult> {
    return this.appointments.create({
      tenantId,
      serviceIds: dto.serviceIds,
      barberId: dto.barberId ?? null,
      startsAt: new Date(dto.startsAt),
      notes: dto.notes ?? null,
      guest:
        dto.guestName && dto.guestPhone
          ? { name: dto.guestName, phone: dto.guestPhone }
          : null,
      clientId: clientIdOf(principal),
      request,
    });
  }

  @Post('appointments/confirm')
  @Throttle({ default: { limit: 15, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Confirma o agendamento de visitante verificado',
    description: 'Segunda metade do fluxo quando `create` respondeu `otp-required`.',
  })
  confirm(
    @Body() dto: ConfirmGuestBookingDto,
    @Req() request: RequestContext,
  ): Promise<CreateAppointmentResult> {
    return this.appointments.confirmGuestBooking(dto.challengeId, dto.code, request);
  }

  @Get('appointments/:code')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Consulta o agendamento pelo código da reserva' })
  findOne(
    @Param('code') code: string,
    @Query() query: AppointmentLookupDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal | undefined,
  ): Promise<AppointmentSummary> {
    return this.appointments.findByCode({
      tenantId,
      bookingCode: code,
      clientId: clientIdOf(principal),
      phone: query.phone ?? null,
    });
  }

  @Post('appointments/:code/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cancela o agendamento',
    description: 'Respeita a janela de `TenantSettings.cancelamentoHoras`.',
  })
  cancel(
    @Param('code') code: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal | undefined,
    @Req() request: RequestContext,
  ): Promise<AppointmentSummary> {
    return this.appointments.cancel({
      tenantId,
      bookingCode: code,
      clientId: clientIdOf(principal),
      phone: dto.phone ?? null,
      reason: dto.reason ?? null,
      request,
    });
  }

  @Post('appointments/:code/reschedule')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remarca o agendamento para outro horário' })
  reschedule(
    @Param('code') code: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal | undefined,
    @Req() request: RequestContext,
  ): Promise<AppointmentSummary> {
    return this.appointments.reschedule({
      tenantId,
      bookingCode: code,
      clientId: clientIdOf(principal),
      phone: dto.phone ?? null,
      startsAt: new Date(dto.startsAt),
      barberId: dto.barberId ?? null,
      request,
    });
  }
}

/**
 * Só principal de CLIENTE conta como "o cliente desta reserva". Um dono logado
 * no painel abrindo a página da própria barbearia é um visitante como outro
 * qualquer — a assinatura e os agendamentos dele vivem na conta de cliente.
 */
function clientIdOf(principal: AuthPrincipal | undefined): string | null {
  return principal?.kind === 'client' ? principal.id : null;
}
