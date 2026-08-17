/** Contratos HTTP genéricos compartilhados entre API e frontends. */

export interface PaginationQuery {
  page?: number;
  perPage?: number;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

/** Header que carrega o tenant nas rotas públicas por slug. */
export const TENANT_HEADER = 'x-tenant-slug';
/** Header de correlação — ecoado pelo interceptor de requestId da API. */
export const REQUEST_ID_HEADER = 'x-request-id';

export type HealthState = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'error';
  uptime: number;
  version: string;
  timestamp: string;
  services: {
    database: { status: HealthState; latencyMs?: number; error?: string };
    redis: { status: HealthState; latencyMs?: number; error?: string };
  };
}
