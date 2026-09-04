import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MyPageReviewItem, MyPageSettings, PublicBarbershop } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { MAX_IMAGE_BYTES } from '../adapters/storage/storage.adapter';
import { MyPageService, type UploadedImageFile } from './my-page.service';
import { MyPageImageSlotParam, UpdateMyPageDto, UpdateMyPageReviewDto } from './dto/settings.dto';

/**
 * Upload em memória (padrão do multer quando não se declara `storage`): o
 * arquivo cabe em 5 MB e vai direto para o `StorageAdapter`, sem arquivo
 * temporário no disco da API — o driver é quem decide onde o byte descansa
 * (disco em dev, bucket depois).
 *
 * O teto vive AQUI e no driver: o multer corta a requisição antes de alocar o
 * buffer inteiro, e o driver protege quem chamar o storage por outro caminho.
 */
const IMAGE_UPLOAD = FileInterceptor('file', {
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

/** Corpo multipart no Swagger — sem isto o "Try it out" não mostra o seletor. */
const IMAGE_BODY = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
    required: ['file'],
  },
};

/**
 * Minha Página — branding público.
 *
 * NÃO é gate de plano: `minhaPagina` não está em `FEATURE_KEYS` (SPEC) e o
 * overlay "Disponível no plano Avançado" do protótipo (`Dashboard.dc.html`
 * l.2319) é código morto lá — `minhaPaginaLocked` é `false` fixo na l.6990 e
 * nunca liga. Toda barbearia edita a própria página, em qualquer plano.
 */
@ApiTags('my-page')
@ApiBearerAuth('access-token')
@Controller('my-page')
@Roles('OWNER', 'MANAGER')
export class MyPageController {
  constructor(private readonly myPage: MyPageService) {}

  @Get()
  @ApiOperation({ summary: 'Branding da página pública' })
  async get(@CurrentTenant('id') tenantId: string): Promise<MyPageSettings> {
    return this.myPage.get(tenantId);
  }

  @Get('preview')
  @ApiOperation({ summary: 'Payload da página pública, para o preview ao vivo' })
  async preview(@CurrentTenant('id') tenantId: string): Promise<PublicBarbershop> {
    return this.myPage.preview(tenantId);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualiza o branding da página pública' })
  async update(
    @Body() dto: UpdateMyPageDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<MyPageSettings> {
    return this.myPage.update(tenantId, dto, principal.id, request);
  }

  // ── Logo e capa ────────────────────────────────────────────────────────

  @Post('images/:slot')
  @UseInterceptors(IMAGE_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMAGE_BODY)
  @ApiOperation({ summary: 'Envia o logo ou a capa (JPG/PNG/WebP, até 5 MB)' })
  async uploadImage(
    @Param() { slot }: MyPageImageSlotParam,
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<MyPageSettings> {
    return this.myPage.uploadImage(tenantId, slot, file, principal.id, request);
  }

  @Delete('images/:slot')
  @ApiOperation({ summary: 'Remove o logo ou a capa' })
  async removeImage(
    @Param() { slot }: MyPageImageSlotParam,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<MyPageSettings> {
    return this.myPage.removeImage(tenantId, slot, principal.id, request);
  }

  // ── Galeria ────────────────────────────────────────────────────────────

  @Post('photos')
  @UseInterceptors(IMAGE_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMAGE_BODY)
  @ApiOperation({ summary: 'Adiciona uma foto à galeria' })
  async addPhoto(
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<MyPageSettings> {
    return this.myPage.addPhoto(tenantId, file, principal.id, request);
  }

  @Delete('photos/:id')
  @ApiOperation({ summary: 'Remove uma foto da galeria' })
  async removePhoto(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<MyPageSettings> {
    return this.myPage.removePhoto(tenantId, id, principal.id, request);
  }

  // ── Avaliações recebidas ───────────────────────────────────────────────

  @Get('reviews')
  @ApiOperation({ summary: 'Todas as avaliações recebidas, publicadas ou não' })
  async listReviews(@CurrentTenant('id') tenantId: string): Promise<MyPageReviewItem[]> {
    return this.myPage.listReviews(tenantId);
  }

  @Patch('reviews/:id')
  @ApiOperation({ summary: 'Publica ou despublica uma avaliação na página' })
  async setReviewPublished(
    @Param('id') id: string,
    @Body() dto: UpdateMyPageReviewDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<MyPageReviewItem[]> {
    return this.myPage.setReviewPublished(tenantId, id, dto.published, principal.id, request);
  }
}
