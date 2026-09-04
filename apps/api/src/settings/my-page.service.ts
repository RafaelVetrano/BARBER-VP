import { Inject, Injectable } from '@nestjs/common';
import type {
  MyPageImageSlot,
  MyPageReviewItem,
  MyPageSettings,
  PublicBarbershop,
  UpdateMyPageDto as UpdateMyPageContract,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { SlugService } from '../tenants/slug.service';
import { CONFIG, type AppConfig } from '../config/configuration';
import { PublicPageService } from '../booking/public-page.service';
import { STORAGE_ADAPTER, type StorageAdapter } from '../adapters/storage/storage.adapter';
import { ErrorCode } from '@barbervp/types';

/** Quantas fotos a galeria aceita. O preview do protótipo mostra 3 por linha. */
const MAX_GALLERY_PHOTOS = 12;

/** Pasta do storage por slot — segundo nível de `{tenantId}/{folder}/`. */
const SLOT_FOLDER: Record<MyPageImageSlot, string> = { logo: 'logo', cover: 'capa' };

export interface UploadedImageFile {
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class MyPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly slugs: SlugService,
    private readonly publicPage: PublicPageService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async get(tenantId: string): Promise<MyPageSettings> {
    const tenant = await this.prisma.tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: {
        slug: true,
        settings: true,
      },
    });
    const photos = await this.prisma.tenantPhoto.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // `urls.publicBooking` e não `urls.booking`: é a base do link que o cliente
    // recebe, e em produção ela pode ser um domínio próprio de agendamento.
    const base = this.config.urls.publicBooking;

    return {
      slug: tenant.slug,
      publicUrl: `${base}/${tenant.slug}`,
      publicBaseUrl: base,
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

  /**
   * Payload EXATO da página pública, para o "Preview ao vivo" do protótipo
   * (l.2340). Reusa `PublicPageService` de propósito: se o preview montasse a
   * própria consulta, ele mostraria uma página que não existe — e o critério
   * desta aba é justamente que salvar reflita em `/{slug}`.
   */
  async preview(tenantId: string): Promise<PublicBarbershop> {
    return this.publicPage.getBySlug(tenantId, null);
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
        throw ApiException.conflict('Este link já está em uso.', ErrorCode.SLUG_IN_USE);
      }
      // Grava o slug JÁ NORMALIZADO que a checagem aprovou — normalizar de
      // novo aqui abriria espaço para gravar algo diferente do que foi
      // verificado como livre.
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { slug: availability.slug } });
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

  // ── Imagens ────────────────────────────────────────────────────────────

  /**
   * Grava logo ou capa e troca a URL em `TenantSettings`.
   *
   * A imagem anterior é apagada DEPOIS do update: se o banco falhar, o
   * registro continua apontando para um arquivo que existe. O contrário
   * deixaria a página pública com imagem quebrada.
   */
  async uploadImage(
    tenantId: string,
    slot: MyPageImageSlot,
    file: UploadedImageFile | undefined,
    actorUserId: string,
    request: RequestContext,
  ): Promise<MyPageSettings> {
    if (!file) {
      throw ApiException.badRequest('Nenhum arquivo enviado.');
    }

    const current = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { logoUrl: true, coverUrl: true },
    });
    const previousUrl = slot === 'logo' ? current?.logoUrl : current?.coverUrl;

    const stored = await this.storage.put({
      tenantId,
      folder: SLOT_FOLDER[slot],
      mimeType: file.mimetype,
      buffer: file.buffer,
    });

    const field = slot === 'logo' ? 'logoUrl' : 'coverUrl';
    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: { [field]: stored.url },
      create: { tenantId, [field]: stored.url },
    });

    await this.discardStored(previousUrl);
    await this.audit.record(
      { action: AuditAction.MY_PAGE_UPDATED, entity: 'TenantSettings', entityId: tenantId, tenantId, actorUserId },
      request,
    );

    return this.get(tenantId);
  }

  async removeImage(
    tenantId: string,
    slot: MyPageImageSlot,
    actorUserId: string,
    request: RequestContext,
  ): Promise<MyPageSettings> {
    const current = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { logoUrl: true, coverUrl: true },
    });
    const previousUrl = slot === 'logo' ? current?.logoUrl : current?.coverUrl;

    const field = slot === 'logo' ? 'logoUrl' : 'coverUrl';
    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: { [field]: null },
      create: { tenantId },
    });

    await this.discardStored(previousUrl);
    await this.audit.record(
      { action: AuditAction.MY_PAGE_UPDATED, entity: 'TenantSettings', entityId: tenantId, tenantId, actorUserId },
      request,
    );

    return this.get(tenantId);
  }

  async addPhoto(
    tenantId: string,
    file: UploadedImageFile | undefined,
    actorUserId: string,
    request: RequestContext,
  ): Promise<MyPageSettings> {
    if (!file) {
      throw ApiException.badRequest('Nenhum arquivo enviado.');
    }

    const total = await this.prisma.tenantPhoto.count({ where: { tenantId } });
    if (total >= MAX_GALLERY_PHOTOS) {
      throw ApiException.conflict(`A galeria comporta até ${MAX_GALLERY_PHOTOS} fotos.`);
    }

    const stored = await this.storage.put({
      tenantId,
      folder: 'galeria',
      mimeType: file.mimetype,
      buffer: file.buffer,
    });

    const last = await this.prisma.tenantPhoto.aggregate({ where: { tenantId }, _max: { sortOrder: true } });
    await this.prisma.tenantPhoto.create({
      data: { tenantId, url: stored.url, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });

    await this.audit.record(
      { action: AuditAction.MY_PAGE_UPDATED, entity: 'TenantPhoto', entityId: tenantId, tenantId, actorUserId },
      request,
    );

    return this.get(tenantId);
  }

  async removePhoto(
    tenantId: string,
    photoId: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<MyPageSettings> {
    // `deleteMany` com `tenantId` no filtro, e não `delete` por id: um id de
    // outra barbearia sai daqui como 404, nunca como remoção alheia.
    const photo = await this.prisma.tenantPhoto.findFirst({
      where: { id: photoId, tenantId },
      select: { url: true },
    });
    if (!photo) {
      throw ApiException.notFound('Foto não encontrada.');
    }

    await this.prisma.tenantPhoto.deleteMany({ where: { id: photoId, tenantId } });
    await this.discardStored(photo.url);
    await this.audit.record(
      { action: AuditAction.MY_PAGE_UPDATED, entity: 'TenantPhoto', entityId: photoId, tenantId, actorUserId },
      request,
    );

    return this.get(tenantId);
  }

  // ── Avaliações recebidas ───────────────────────────────────────────────

  /** TODAS as avaliações da barbearia — a tabela é onde se escolhe quais publicar. */
  async listReviews(tenantId: string): Promise<MyPageReviewItem[]> {
    const reviews = await this.prisma.review.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        authorName: true,
        rating: true,
        comment: true,
        published: true,
        barber: { select: { name: true } },
      },
    });

    return reviews.map((review) => ({
      id: review.id,
      createdAt: review.createdAt.toISOString(),
      authorName: review.authorName,
      rating: review.rating,
      comment: review.comment,
      barberName: review.barber?.name ?? null,
      published: review.published,
    }));
  }

  async setReviewPublished(
    tenantId: string,
    reviewId: string,
    published: boolean,
    actorUserId: string,
    request: RequestContext,
  ): Promise<MyPageReviewItem[]> {
    const updated = await this.prisma.review.updateMany({
      where: { id: reviewId, tenantId },
      data: { published },
    });
    if (updated.count === 0) {
      throw ApiException.notFound('Avaliação não encontrada.');
    }

    await this.audit.record(
      { action: AuditAction.MY_PAGE_UPDATED, entity: 'Review', entityId: reviewId, tenantId, actorUserId },
      request,
    );

    return this.listReviews(tenantId);
  }

  /**
   * Apaga do storage a imagem que acabou de sair do ar.
   *
   * `keyFromUrl` devolve `null` para URL que não é deste storage — o caso das
   * `logoUrl` digitadas à mão desde a fase 03 — e aí não há nada a remover.
   */
  private async discardStored(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const key = this.storage.keyFromUrl(url);
    if (key) {
      await this.storage.remove(key);
    }
  }
}
