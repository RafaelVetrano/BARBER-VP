import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  TokenAudience,
  type AuthClient,
  type ClientSession,
  type ExportedClientData,
  type OtpChallenge,
  type OtpVerifyResult,
} from '@barbervp/types';
import type { Response } from 'express';
import { Public, TenantOptional } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { ClientAuthService, type IssuedClientAuth } from './client-auth.service';
import { RefreshCookieService } from './tokens/refresh-cookie.service';
import {
  ChangeClientPasswordDto,
  ClientForgotPasswordDto,
  ClientLoginDto,
  ClientRegisterDto,
  ClientResetPasswordDto,
  ConfirmPhoneChangeDto,
  DeleteClientAccountDto,
  OtpChallengeRefDto,
  OtpResendDto,
  OtpVerifyDto,
  RequestPhoneChangeDto,
  UpdateClientProfileDto,
} from './dto/client-auth.dto';

/**
 * Auth do cliente final — consumida pelo sheet `ClienteAuth` do `apps/booking`.
 *
 * `@TenantOptional()` no controller inteiro: a conta do cliente é global, então
 * nenhuma destas rotas exige barbearia (mesmo quando o sheet é aberto de dentro
 * da página de uma).
 */
@ApiTags('auth')
@Controller('client-auth')
@TenantOptional()
export class ClientAuthController {
  constructor(
    private readonly auth: ClientAuthService,
    private readonly cookies: RefreshCookieService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login do cliente por telefone OU e-mail' })
  async login(
    @Body() dto: ClientLoginDto,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ClientSession> {
    return this.respond(await this.auth.login(dto, request), response);
  }

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Inicia o cadastro do cliente',
    description:
      'Não cria a conta ainda: valida os dados e dispara o OTP. A conta nasce ' +
      'na verificação, para ninguém ocupar o telefone de outra pessoa.',
  })
  register(@Body() dto: ClientRegisterDto, @Req() request: RequestContext): Promise<OtpChallenge> {
    return this.auth.register(dto, request);
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Verifica o código de 6 dígitos',
    description: 'No cadastro devolve a sessão; na recuperação, o token de troca de senha.',
  })
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OtpVerifyResult> {
    const result = await this.auth.verifyOtp(dto.challengeId, dto.code, request);

    if (result.kind === 'password-reset') {
      return {
        kind: 'password-reset',
        resetToken: result.resetToken,
        expiresInSeconds: result.expiresInSeconds,
      };
    }

    return { kind: 'session', session: this.respond(result.auth, response) };
  }

  @Post('otp/resend')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({ summary: 'Reenvia o código (cooldown de 59s)' })
  resendOtp(@Body() dto: OtpResendDto): Promise<OtpChallenge> {
    return this.auth.resendOtp(dto.challengeId, dto.channel);
  }

  @Post('otp/call')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Receber o código por chamada',
    description: 'Stub desta fase: registra a intenção e reenvia pelo canal padrão.',
  })
  requestCall(@Body() dto: OtpChallengeRefDto): Promise<OtpChallenge> {
    return this.auth.requestVoiceCall(dto.challengeId);
  }

  @Post('password/forgot')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Abre o desafio de recuperação (telefone ou e-mail)',
    description: 'Responde igual exista ou não a conta.',
  })
  forgotPassword(
    @Body() dto: ClientForgotPasswordDto,
    @Req() request: RequestContext,
  ): Promise<OtpChallenge> {
    return this.auth.forgotPassword(dto, request);
  }

  @Post('password/reset')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({ summary: 'Define a nova senha com o token do OTP verificado' })
  resetPassword(
    @Body() dto: ClientResetPasswordDto,
    @Req() request: RequestContext,
  ): Promise<void> {
    return this.auth.resetPassword(dto, request);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotaciona o par de tokens do cliente' })
  async refresh(
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ClientSession> {
    const token = this.cookies.read(request, TokenAudience.CLIENT);
    try {
      return this.respond(await this.auth.refresh(token, request), response);
    } catch (error) {
      this.cookies.clear(response, TokenAudience.CLIENT);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Encerra a sessão do cliente' })
  async logout(
    @CurrentUser() principal: AuthPrincipal | undefined,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(principal, this.cookies.read(request, TokenAudience.CLIENT), request);
    this.cookies.clear(response, TokenAudience.CLIENT);
  }

  @Get('me')
  @Roles('CLIENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cliente autenticado' })
  me(@CurrentUser() principal: AuthPrincipal): Promise<AuthClient> {
    return this.auth.me(principal);
  }

  // ── "Meus dados" (fase 05 — `MinhaConta`) ─────────────────────────────────

  @Patch('me')
  @Roles('CLIENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Atualiza nome, e-mail e preferências de notificação' })
  updateProfile(
    @Body() dto: UpdateClientProfileDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<AuthClient> {
    return this.auth.updateProfile(principal, dto, request);
  }

  @Post('me/phone')
  @Roles('CLIENT')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Inicia a troca de telefone',
    description: 'O telefone é a identidade da conta — a troca dispara o mesmo desafio do registro.',
  })
  requestPhoneChange(
    @Body() dto: RequestPhoneChangeDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<OtpChallenge> {
    return this.auth.requestPhoneChange(principal, dto, request);
  }

  @Post('me/phone/confirm')
  @Roles('CLIENT')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 300_000 } })
  @ApiOperation({ summary: 'Confirma a troca de telefone com o código de 6 dígitos' })
  confirmPhoneChange(
    @Body() dto: ConfirmPhoneChangeDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<AuthClient> {
    return this.auth.confirmPhoneChange(principal, dto, request);
  }

  @Post('password/change')
  @Roles('CLIENT')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Troca a senha logado — a atual prova quem está pedindo' })
  changePassword(
    @Body() dto: ChangeClientPasswordDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<void> {
    return this.auth.changePassword(principal, dto, request);
  }

  // ── LGPD (regra 6) ─────────────────────────────────────────────────────────

  @Get('me/export')
  @Roles('CLIENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Exporta os dados do cliente em JSON',
    description:
      'Não aparece na UI do protótipo — dívida técnica registrada em CONTEXT.md, implementada ' +
      'mesmo assim por exigência da LGPD (art. 18 IV/V).',
  })
  exportData(
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<ExportedClientData> {
    return this.auth.exportData(principal, request);
  }

  @Post('me/delete')
  @Roles('CLIENT')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Exclui a conta (anonimiza, não apaga)',
    description:
      'Order/Payment históricos continuam intactos para a integridade financeira da barbearia; ' +
      'só o que identifica a pessoa é substituído.',
  })
  requestDeletion(
    @Body() dto: DeleteClientAccountDto,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<void> {
    return this.auth.requestDeletion(principal, dto, request);
  }

  private respond(issued: IssuedClientAuth, response: Response): ClientSession {
    this.cookies.set(response, TokenAudience.CLIENT, issued.refreshToken, issued.refreshExpiresAt);
    return issued.session;
  }
}
