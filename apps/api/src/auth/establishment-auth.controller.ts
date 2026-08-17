import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TokenAudience, type EmailCheckResult, type EstablishmentSession } from '@barbervp/types';
import type { Response } from 'express';
import { Public, TenantOptional } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { EstablishmentAuthService, type IssuedAuth } from './establishment-auth.service';
import { RefreshCookieService } from './tokens/refresh-cookie.service';
import {
  ChangePasswordDto,
  CheckEmailDto,
  ForgotPasswordDto,
  LinkClientAccountDto,
  LoginEstablishmentDto,
  RegisterEstablishmentDto,
  ResetPasswordDto,
  SwitchContextDto,
} from './dto/establishment-auth.dto';

/**
 * Auth do painel (`apps/site` → `apps/dashboard`).
 *
 * Todas as rotas são `@TenantOptional()`: o tenant destas rotas ou ainda não
 * existe (registro) ou nasce do próprio login — nunca de header ou body.
 *
 * Os `@Throttle` daqui são bem mais apertados que o limite global do
 * `app.module.ts`: login e recuperação de senha são o alvo óbvio de força bruta.
 */
@ApiTags('auth')
@Controller('auth')
@TenantOptional()
export class EstablishmentAuthController {
  constructor(
    private readonly auth: EstablishmentAuthService,
    private readonly cookies: RefreshCookieService,
  ) {}

  @Post('check-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Estado do e-mail no cadastro',
    description:
      'Devolve `available`, `establishment` (já existe painel) ou `client` ' +
      '(conta de cliente que pode ser vinculada).',
  })
  checkEmail(@Body() dto: CheckEmailDto): Promise<EmailCheckResult> {
    return this.auth.checkEmail(dto.email);
  }

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Cadastra barbearia (User + Tenant + Membership em transação única)' })
  async register(
    @Body() dto: RegisterEstablishmentDto,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EstablishmentSession> {
    return this.respond(await this.auth.register(dto, request), response);
  }

  @Post('register/link')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Cria a barbearia reaproveitando uma conta de cliente existente',
    description: 'Exige a senha atual da conta de cliente. Não duplica cadastro.',
  })
  async linkAccount(
    @Body() dto: LinkClientAccountDto,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EstablishmentSession> {
    return this.respond(await this.auth.linkClientAccount(dto, request), response);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login do painel' })
  async login(
    @Body() dto: LoginEstablishmentDto,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EstablishmentSession> {
    return this.respond(await this.auth.login(dto, request), response);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Rotaciona o par de tokens',
    description: 'Lê o refresh do cookie httpOnly; reuso de token revoga a família inteira.',
  })
  async refresh(
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EstablishmentSession> {
    const token = this.cookies.read(request, TokenAudience.ESTABLISHMENT);
    try {
      return this.respond(await this.auth.refresh(token, request), response);
    } catch (error) {
      this.cookies.clear(response, TokenAudience.ESTABLISHMENT);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Encerra a sessão e limpa o cookie' })
  async logout(
    @CurrentUser() principal: AuthPrincipal | undefined,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(principal, this.cookies.read(request, TokenAudience.ESTABLISHMENT), request);
    this.cookies.clear(response, TokenAudience.ESTABLISHMENT);
  }

  @Get('me')
  @Roles('OWNER', 'MANAGER', 'BARBER', 'SUPER_ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Usuário autenticado e seus vínculos' })
  me(@CurrentUser() principal: AuthPrincipal) {
    return this.auth.me(principal);
  }

  @Post('context')
  @Roles('OWNER', 'MANAGER', 'BARBER', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Seletor de contexto',
    description: 'Emite um par novo apontando para outra barbearia do mesmo usuário.',
  })
  async switchContext(
    @Body() dto: SwitchContextDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EstablishmentSession> {
    const token = this.cookies.read(request, TokenAudience.ESTABLISHMENT);
    return this.respond(
      await this.auth.switchContext(principal, dto.tenantId, token, request),
      response,
    );
  }

  @Post('password/change')
  @Roles('OWNER', 'MANAGER', 'BARBER', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Troca a senha (derruba as demais sessões)' })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<void> {
    return this.auth.changePassword(principal, dto, request);
  }

  @Post('password/forgot')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Envia link de recuperação',
    description: 'Responde 202 sempre — existindo o e-mail ou não.',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: RequestContext,
  ): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto.email, request);
    return {
      message: 'Se houver uma conta com este e-mail, enviamos as instruções de recuperação.',
    };
  }

  @Post('password/reset')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({ summary: 'Define a nova senha a partir do token do e-mail' })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: RequestContext): Promise<void> {
    return this.auth.resetPassword(dto.token, dto.password, request);
  }

  /** Grava o refresh no cookie httpOnly e devolve só o access no corpo. */
  private respond(issued: IssuedAuth, response: Response): EstablishmentSession {
    this.cookies.set(
      response,
      TokenAudience.ESTABLISHMENT,
      issued.refreshToken,
      issued.refreshExpiresAt,
    );
    return issued.session;
  }
}
