import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Paginated } from '@barbervp/types';

/**
 * Base de paginação reusada por todo `@Query()` de listagem da fase 06 —
 * `page`/`perPage` chegam como string na querystring, `@Type(() => Number)`
 * converte antes das validações.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;
}

export interface PageWindow {
  skip: number;
  take: number;
  page: number;
  perPage: number;
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

/** Normaliza `page`/`perPage` (já validados, mas ainda `undefined` em pedidos sem query) em offset/limit do Prisma. */
export function pageWindow(page?: number, perPage?: number): PageWindow {
  const safePage = Math.max(1, page ?? 1);
  const safePerPage = Math.min(MAX_PER_PAGE, Math.max(1, perPage ?? DEFAULT_PER_PAGE));
  return { skip: (safePage - 1) * safePerPage, take: safePerPage, page: safePage, perPage: safePerPage };
}

export function toPaginated<T>(data: T[], total: number, window: PageWindow): Paginated<T> {
  return {
    data,
    meta: {
      page: window.page,
      perPage: window.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / window.perPage)),
    },
  };
}
