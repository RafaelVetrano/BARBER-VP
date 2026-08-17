import { Inject, Injectable } from '@nestjs/common';
import type {
  AddTenantPhotoDto as AddTenantPhotoContract,
  MyPageSettings,
  UpdateMyPageDto as UpdateMyPageContract,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { SlugService } from '../tenants/slug.service';
import { CONFIG, type AppConfig } from '../config/configuration';

@Injectable()
export class MyPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly slugs: SlugService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async get(tenantId: string): Promise<MyPageSettings> {
    const tenant = await this.prisma.tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: {
        slug: true,
        settings: true,
      },
    });
    const photos = await this.prisma.tenantPhoto.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } });

    return {
      slug: tenant.slug,
      publicUrl: `${this.config.urls.booking}/${tenant.slug}`,
      sobre: tenant.settings?.sobre ?? null,
      instagram: tenant.settings?.instagram ?? null,
      address: tenant.settings?.address ?? null,
      logoUrl: tenant.settings?.logoUrl ?? null,
      coverUrl: tenant.settings?.coverUrl ?? null,
      showServices: tenant.settings?.showServices ?? true,
      showReviews: tenant.settings?.showReviews ?? true,
      showPhotos: tenant.settings?.showPhotos ?? true,
      showBusinessHours: tenant.settings?.showBusinessHours ?? true,
      photos: photos.map((photo) => ({ id: photo.id, url: photo.url, sortOrder: photo.sortOrder })),
    };
  }

  async update(
    tenantId: string,
    dto: UpdateMyPageContract,
    actorUserId: string,
    request: RequestContext,
  ): Promise<MyPageSettings> {
    if (dto.slug) {
      const availability = await this.slugs.checkAvailability(dto.slug, tenantId);
      if (!availability.available) {
        throw ApiException.conflict('Este link já está em uso.', 'SLUG_TAKEN');
      }
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { slug: this.slugs.normalize(dto.slug) } });
    }

    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: {
        sobre: dto.sobre,
        instagram: dto.instagram,
        address: dto.address,
        showServices: dto.showServices,
        showReviews: dto.showReviews,
        showPhotos: dto.showPhotos,
        showBusinessHours: dto.showBusinessHours,
      },
      create: {
        tenantId,
        sobre: dto.sobre ?? null,
        instagram: dto.instagram ?? null,
        address: dto.address ?? null,
        showServices: dto.showServices ?? true,
        showReviews: dto.showReviews ?? true,
        showPhotos: dto.showPhotos ?? true,
        showBusinessHours: dto.showBusinessHours ?? true,
      },
    });

    await this.audit.record(
      { action: AuditAction.MY_PAGE_UPDATED, entity: 'TenantSettings', entityId: tenantId, tenantId, actorUserId },
      request,
    );

    return this.get(tenantId);
  }

  async addPhoto(tenantId: string, dto: AddTenantPhotoContract): Promise<MyPageSettings> {
    const last = await this.prisma.tenantPhoto.aggregate({ where: { tenantId }, _max: { sortOrder: true } });
    await this.prisma.tenantPhoto.create({
      data: { tenantId, url: dto.url, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return this.get(tenantId);
  }

  async removePhoto(tenantId: string, photoId: string): Promise<MyPageSettings> {
    const deleted = await this.prisma.tenantPhoto.deleteMany({ where: { id: photoId, tenantId } });
    if (deleted.count === 0) {
      throw ApiException.notFound('Foto não encontrada.');
    }
    return this.get(tenantId);
  }
}
