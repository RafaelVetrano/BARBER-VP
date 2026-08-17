import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  ErrorCode,
  REQUEST_ID_HEADER,
  TENANT_HEADER,
  isApiErrorBody,
  type ApiErrorBody,
} from '@barbervp/types';

/** Erro normalizado que as apps tratam — sempre `{ code, message, details? }`. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(body: ApiErrorBody, status: number, requestId?: string) {
    super(body.message);
    this.name = 'ApiError';
    this.code = body.code;
    this.status = status;
    this.details = body.details;
    this.requestId = requestId;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

export interface ApiClientOptions {
  baseURL: string;
  /** Slug do tenant nas rotas públicas (`/{slug}` do booking). */
  getTenantSlug?: () => string | null | undefined;
  /** Access token em memória (nunca em localStorage). */
  getAccessToken?: () => string | null | undefined;
  /**
   * Renova o par de tokens usando o refresh httpOnly rotativo.
   * Stub nesta fase — a fase 03 injeta a implementação real; enquanto não
   * for fornecida, um 401 apenas propaga para `onUnauthorized`.
   */
  refreshTokens?: () => Promise<void>;
  /** Chamado quando o 401 é definitivo (sem refresh possível). */
  onUnauthorized?: () => void;
  timeoutMs?: number;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

function toApiError(error: AxiosError): ApiError {
  const status = error.response?.status ?? 0;
  const requestId = error.response?.headers?.[REQUEST_ID_HEADER] as string | undefined;
  const payload = error.response?.data;

  if (isApiErrorBody(payload)) {
    return new ApiError(payload, status, requestId);
  }
  if (error.code === 'ECONNABORTED') {
    return new ApiError(
      { code: ErrorCode.SERVICE_UNAVAILABLE, message: 'A requisição demorou demais.' },
      status,
      requestId,
    );
  }
  if (status === 0) {
    return new ApiError(
      { code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Não foi possível falar com o servidor.' },
      status,
      requestId,
    );
  }
  return new ApiError(
    { code: ErrorCode.INTERNAL_ERROR, message: error.message || 'Erro inesperado.' },
    status,
    requestId,
  );
}

export function createApiClient(options: ApiClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 15_000,
    // Necessário para o refresh token httpOnly (fase 03).
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = options.getAccessToken?.();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    const slug = options.getTenantSlug?.();
    if (slug) {
      config.headers.set(TENANT_HEADER, slug);
    }
    return config;
  });

  // Single-flight: N requisições que tomam 401 simultaneamente disparam um
  // único refresh e aguardam a mesma promise.
  let refreshInFlight: Promise<void> | null = null;

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as RetriableConfig | undefined;
      const status = error.response?.status;

      if (status === 401 && config && !config._retried && options.refreshTokens) {
        config._retried = true;
        try {
          refreshInFlight ??= options.refreshTokens().finally(() => {
            refreshInFlight = null;
          });
          await refreshInFlight;
          return client.request(config);
        } catch {
          options.onUnauthorized?.();
          throw toApiError(error);
        }
      }

      if (status === 401) {
        options.onUnauthorized?.();
      }
      throw toApiError(error);
    },
  );

  return client;
}

/** Helper tipado para consumo direto em `queryFn`. */
export async function get<T>(
  client: AxiosInstance,
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await client.get<T>(url, config);
  return data;
}
