import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { ExportedUserData, MyProfile } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { MAX_IMAGE_BYTES } from '../adapters/storage/storage.adapter';
import { MyProfileService, type UploadedImageFile } from './my-profile.service';
import { RequestAccountDeletionDto, UpdateMyProfileDto } from './dto/my-profile.dto';

/** Mesmo upload em memória de Minha Página — 5 MB, um arquivo. */
const IMAGE_UPLOAD = FileInterceptor('file', {
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

const IMAGE_BODY = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
    required: ['file'],
  },
};

/**
 * "Meu perfil" — a PESSOA logada.
 *
 * O prefixo é `/me`, e não `/settings/*`, porque nada aqui é da barbearia:
 * `/settings` é o TENANT (agente 26) e vive sob `@Roles('OWNER','MANAGER')`.
 * Este controller atende os três papéis — o barbeiro também troca a própria
 * senha e baixa os próprios dados —, e o recorte por papel acontece DENTRO do
 * serviço, campo a campo, porque ele não é "tem acesso ou não": o barbeiro
 * entra, mas com o nome travado, sem foto e sem o bloco de exclusão.
 *
 * A troca de senha continua em `POST /auth/password/change` (fase 03), que já
 * revoga as demais sessões e audita — repetir a rota aqui daria dois caminhos
 * para a mesma operação sensível.
 */
@ApiTags('me')
@ApiBearerAuth('access-token')
@Controller('me')
@Roles('OWNER', 'MANAGER', 'BARBER')
export class MyProfileController {
  constructor(private readonly profile: MyProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Perfil da pessoa logada, já com o que o papel permite' })
  get(
    @CurrentUser() principal: AuthPrincipal,
    @CurrentTenant('id') tenantId: string,
  ): Promise<MyProfile> {
    return this.profile.get(principal.id, tenantId);
  }

  @Patch()
  @ApiOperation({ summary: 'Salva nome, e-mail e WhatsApp' })
  update(
    @Body() dto: UpdateMyProfileDto,
    @CurrentUser() principal: AuthPrincipal,
    @CurrentTenant('id') tenantId: string,
    @Req() request: RequestContext,
  ): Promise<MyProfile> {
    return this.profile.update(principal.id, tenantId, dto, request);
  }

  // ── Foto ──────────────────────────────────────────────────────────────────

  @Post('avatar')
  @UseInterceptors(IMAGE_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMAGE_BODY)
  @ApiOperation({ summary: 'Envia a foto de perfil (JPG/PNG/WebP, até 5 MB)' })
  uploadAvatar(
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentUser() principal: AuthPrincipal,
    @CurrentTenant('id') tenantId: string,
    @Req() request: RequestContext,
  ): Promise<MyProfile> {
    return this.profile.uploadAvatar(principal.id, tenantId, file, request);
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Remove a foto de perfil' })
  removeAvatar(
    @CurrentUser() principal: AuthPrincipal,
    @CurrentTenant('id') tenantId: string,
    @Req() request: RequestContext,
  ): Promise<MyProfile> {
    return this.profile.removeAvatar(principal.id, tenantId, request);
  }

  // ── LGPD ──────────────────────────────────────────────────────────────────

  @Get('export')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Exporta os dados pessoais em JSON (LGPD art. 18 IV/V)',
    description: '"Baixar meus dados" — `Dashboard.dc.html` l.2802.',
  })
  exportData(
    @CurrentUser() principal: AuthPrincipal,
    @CurrentTenant('id') tenantId: string,
    @Req() request: RequestContext,
  ): Promise<ExportedUserData> {
    return this.profile.exportData(principal.id, tenantId, request);
  }

  @Post('data-deletion-request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Encaminha ao dono o pedido de exclusão dos dados (gerente/barbeiro)',
    description: '`DashboardFuncionario.dc.html` l.840 + modal l.1212.',
  })
  requestDataDeletion(
    @CurrentUser() principal: AuthPrincipal,
    @CurrentTenant('id') tenantId: string,
    @Req() request: RequestContext,
  ): Promise<void> {
    return this.profile.requestDataDeletion(principal.id, tenantId, request);
  }

  // ── Exclusão da conta (dono) ──────────────────────────────────────────────

  @Post('account-deletion')
  // Mais folgado que os outros dois de propósito: aqui a barreira real é a
  // palavra por extenso mais o papel de dono, e um teto apertado atrapalha
  // quem erra a confirmação duas vezes mais do que atrapalha um atacante.
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Agenda a exclusão da barbearia (só OWNER)',
    description:
      'Cancela a assinatura na hora e marca a data da faxina — 30 dias para desistir. ' +
      '`modalExcluirConta`, `Dashboard.dc.html` l.3511.',
  })
  requestAccountDeletion(
    @Body() dto: RequestAccountDeletionDto,
    @CurrentUser() principal: AuthPrincipal,
    @CurrentTenant('id') tenantId: string,
    @Req() request: RequestContext,
  ): Promise<MyProfile> {
    return this.profile.requestAccountDeletion(principal.id, tenantId, dto.confirm, request);
  }

  @Delete('account-deletion')
  @ApiOperation({ summary: 'Desiste da exclusão dentro da janela de 30 dias (só OWNER)' })
  cancelAccountDeletion(
    @CurrentUser() principal: AuthPrincipal,
    @CurrentTenant('id') tenantId: string,
    @Req() request: RequestContext,
  ): Promise<MyProfile> {
    return this.profile.cancelAccountDeletion(principal.id, tenantId, request);
  }
}
