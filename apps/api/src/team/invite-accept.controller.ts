import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TokenAudience, type EstablishmentSession, type StaffInvitePreview } from '@barbervp/types';
import type { Response } from 'express';
import { Public, TenantOptional } from '../common/decorators/public.decorator';
import type { RequestContext } from '../common/types/request-context';
import { RefreshCookieService } from '../auth/tokens/refresh-cookie.service';
import { InvitesService } from './invites.service';
import { AcceptStaffInviteDto } from './dto/team.dto';

/**
 * Tela `CadastroFuncionario` — quem recebeu o convite ainda não tem sessão
 * nenhuma, então estas rotas são públicas e identificadas só pelo token do
 * link (nunca por tenant de header/JWT).
 */
@ApiTags('team')
@Controller('staff-invites')
@Public()
@TenantOptional()
export class InviteAcceptController {
  constructor(
    private readonly invites: InvitesService,
    private readonly cookies: RefreshCookieService,
  ) {}

  @Get(':token')
  @ApiOperation({ summary: 'Estado do convite — e-mail travado, serviços e dias pré-marcados' })
  preview(@Param('token') token: string): Promise<StaffInvitePreview> {
    return this.invites.preview(token);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Define a senha e entra para a equipe já logado' })
  async accept(
    @Body() dto: AcceptStaffInviteDto,
    @Req() request: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EstablishmentSession> {
    const issued = await this.invites.accept(dto, request);
    this.cookies.set(response, TokenAudience.ESTABLISHMENT, issued.refreshToken, issued.refreshExpiresAt);
    return issued.session;
  }
}
