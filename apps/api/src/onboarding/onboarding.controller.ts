import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CepLookupResult, OnboardingState, SlugAvailability } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { OnboardingService } from './onboarding.service';
import { CepService } from './cep.service';
import {
  CepParamDto,
  OnboardingBusinessHoursDto,
  OnboardingIdentityDto,
  OnboardingLocationDto,
  OnboardingProfileDto,
  OnboardingServicesDto,
  OnboardingTeamDto,
  SlugQueryDto,
} from './dto/onboarding.dto';

/**
 * Wizard "Configurar Barbearia" (6 passos).
 *
 * O tenant vem SEMPRE do `@CurrentTenant()`, que o `TenantGuard` resolveu do
 * JWT. Nenhuma rota daqui aceita `tenantId` — nem no corpo, nem na query.
 *
 * `MANAGER` entra junto com `OWNER`: o gerente configura a barbearia; só
 * billing e plano do SaaS ficam de fora dele (`SPEC.md` → RBAC).
 */
@ApiTags('tenants')
@ApiBearerAuth('access-token')
@Controller('onboarding')
@Roles('OWNER', 'MANAGER')
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly cep: CepService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Estado do wizard',
    description: 'Permite retomar de onde parou, inclusive em outro dispositivo.',
  })
  getState(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<OnboardingState> {
    return this.onboarding.getState(tenantId, principal);
  }

  @Get('slug')
  @ApiOperation({ summary: 'Verifica se o link público está livre' })
  checkSlug(
    @Query() query: SlugQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<SlugAvailability> {
    return this.onboarding.checkSlug(query.slug, tenantId);
  }

  @Get('cep/:cep')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Consulta de CEP (passo 2)',
    description: 'Proxy da ViaCEP com cache no Redis — o navegador não fala com terceiros.',
  })
  lookupCep(@Param() params: CepParamDto): Promise<CepLookupResult> {
    return this.cep.lookup(params.cep);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Passo 1 — dados da barbearia' })
  saveProfile(
    @Body() dto: OnboardingProfileDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OnboardingState> {
    return this.onboarding.saveProfile(tenantId, dto, principal, request);
  }

  @Put('location')
  @ApiOperation({ summary: 'Passo 2 — localização' })
  saveLocation(
    @Body() dto: OnboardingLocationDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OnboardingState> {
    return this.onboarding.saveLocation(tenantId, dto, principal, request);
  }

  @Put('identity')
  @ApiOperation({ summary: 'Passo 3 — identidade e link público (pulável)' })
  saveIdentity(
    @Body() dto: OnboardingIdentityDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OnboardingState> {
    return this.onboarding.saveIdentity(tenantId, dto, principal, request);
  }

  @Put('services')
  @ApiOperation({ summary: 'Passo 4 — serviços em lote' })
  saveServices(
    @Body() dto: OnboardingServicesDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OnboardingState> {
    return this.onboarding.saveServices(tenantId, dto, principal, request);
  }

  @Put('team')
  @ApiOperation({ summary: 'Passo 5 — equipe em lote (pulável)' })
  saveTeam(
    @Body() dto: OnboardingTeamDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OnboardingState> {
    return this.onboarding.saveTeam(tenantId, dto, principal, request);
  }

  @Put('business-hours')
  @ApiOperation({ summary: 'Passo 6 — horário de funcionamento' })
  saveBusinessHours(
    @Body() dto: OnboardingBusinessHoursDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OnboardingState> {
    return this.onboarding.saveBusinessHours(tenantId, dto, principal, request);
  }

  @Post('complete')
  // Não cria recurso nenhum — só marca a conclusão e devolve o estado, como os
  // demais passos. 201 seria mentira sobre o que aconteceu.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Conclui o wizard' })
  complete(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OnboardingState> {
    return this.onboarding.complete(tenantId, principal, request);
  }
}
