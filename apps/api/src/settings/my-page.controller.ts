import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MyPageSettings } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { MyPageService } from './my-page.service';
import { AddTenantPhotoDto, UpdateMyPageDto } from './dto/settings.dto';

/** Minha Página — branding público. Não é gate de plano (não está em `FEATURE_KEYS`). */
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

  @Post('photos')
  @ApiOperation({ summary: 'Adiciona uma foto à galeria' })
  async addPhoto(@Body() dto: AddTenantPhotoDto, @CurrentTenant('id') tenantId: string): Promise<MyPageSettings> {
    return this.myPage.addPhoto(tenantId, dto);
  }

  @Delete('photos/:id')
  @ApiOperation({ summary: 'Remove uma foto da galeria' })
  async removePhoto(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
  ): Promise<MyPageSettings> {
    return this.myPage.removePhoto(tenantId, id);
  }
}
