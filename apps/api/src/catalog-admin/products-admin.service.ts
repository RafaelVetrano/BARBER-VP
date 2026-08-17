import { Injectable } from '@nestjs/common';
import { Prisma, type Product } from '@prisma/client';
import type { ProductListItem, ProductListResponse } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { pageWindow, toPaginated } from '../common/dto/pagination.dto';
import type { RequestContext } from '../common/types/request-context';
import type { ProductListQueryDto, UpsertProductDto } from './dto/catalog-admin.dto';

/** CRUD de `Product` — estoque com alerta de `estoqueMin` (tela "Serviços & Produtos"). */
@Injectable()
export class ProductsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, query: ProductListQueryDto): Promise<ProductListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const where: Prisma.ProductWhereInput = { tenantId, deletedAt: null };

    if (query.category) {
      where.category = query.category;
    }
    if (query.active !== undefined) {
      where.active = query.active === 'true';
    }
    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    // `estoqueMin` não é constante — o alerta compara duas colunas, o que o
    // Prisma não expressa em `where`. Filtra em memória sobre a página lida
    // por ordenação de estoque, que é o caso de uso real ("ver o que falta").
    if (query.lowStock === 'true') {
      const all = await this.prisma.product.findMany({ where, orderBy: { stock: 'asc' } });
      const low = all.filter((product) => product.stock <= product.estoqueMin);
      const page = low.slice(window.skip, window.skip + window.take);
      return toPaginated(page.map(toListItem), low.length, window);
    }

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        skip: window.skip,
        take: window.take,
      }),
      this.prisma.product.count({ where }),
    ]);

    return toPaginated(rows.map(toListItem), total, window);
  }

  async create(
    tenantId: string,
    dto: UpsertProductDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ProductListItem> {
    const created = await this.runGuardingUniqueName(() =>
      this.prisma.product.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          sku: dto.sku ?? null,
          description: dto.description ?? null,
          category: dto.category ?? null,
          priceCents: dto.priceCents,
          costCents: dto.costCents ?? null,
          stock: dto.stock ?? 0,
          estoqueMin: dto.estoqueMin ?? 0,
          active: dto.active ?? true,
        },
      }),
    );

    await this.audit.record(
      {
        action: AuditAction.PRODUCT_CREATED,
        entity: 'Product',
        entityId: created.id,
        tenantId,
        actorUserId,
        metadata: { name: created.name },
      },
      request,
    );

    return toListItem(created);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpsertProductDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ProductListItem> {
    await this.loadOwned(tenantId, id);

    const updated = await this.runGuardingUniqueName(() =>
      this.prisma.product.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          sku: dto.sku ?? null,
          description: dto.description ?? null,
          category: dto.category ?? null,
          priceCents: dto.priceCents,
          costCents: dto.costCents ?? null,
          stock: dto.stock ?? undefined,
          estoqueMin: dto.estoqueMin ?? undefined,
          active: dto.active ?? true,
        },
      }),
    );

    await this.audit.record(
      {
        action: AuditAction.PRODUCT_UPDATED,
        entity: 'Product',
        entityId: updated.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return toListItem(updated);
  }

  async setActive(
    tenantId: string,
    id: string,
    active: boolean,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ProductListItem> {
    await this.loadOwned(tenantId, id);

    const updated = await this.prisma.product.update({ where: { id }, data: { active } });

    await this.audit.record(
      {
        action: AuditAction.PRODUCT_ARCHIVED,
        entity: 'Product',
        entityId: updated.id,
        tenantId,
        actorUserId,
        metadata: { active },
      },
      request,
    );

    return toListItem(updated);
  }

  private async loadOwned(tenantId: string, id: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw ApiException.notFound('Produto não encontrado.');
    }
  }

  private async runGuardingUniqueName<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw ApiException.conflict('Já existe um produto com este nome.');
      }
      throw error;
    }
  }
}

function toListItem(product: Product): ProductListItem {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    category: product.category,
    priceCents: product.priceCents,
    costCents: product.costCents,
    stock: product.stock,
    estoqueMin: product.estoqueMin,
    active: product.active,
    lowStock: product.stock <= product.estoqueMin,
  };
}
