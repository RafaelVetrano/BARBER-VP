import type { AxiosInstance } from 'axios';
import { createApiClient, type ApiClientOptions } from './api-client';

let browserClient: AxiosInstance | null = null;

/**
 * Ganchos que o provider de auth preenche depois que o cliente já existe.
 *
 * Sem esta indireção haveria um ciclo: o interceptor precisa do token, que vive
 * no provider, que precisa do cliente para chamar a API. Guardando funções
 * mutáveis, o cliente é criado uma vez só e passa a enxergar a sessão assim que
 * o provider monta.
 */
const hooks: Pick<
  ApiClientOptions,
  'getAccessToken' | 'getTenantSlug' | 'refreshTokens' | 'onUnauthorized'
> = {};

export type ApiClientHooks = typeof hooks;

/** Liga (ou religa) os ganchos de sessão. Chamado pelos providers de auth. */
export function configureApiClient(next: ApiClientHooks): void {
  Object.assign(hooks, next);
}

function resolveBaseURL(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_API_URL não definida — copie o `.env.example` do app antes de subir.',
    );
  }
  return url;
}

/**
 * Cliente HTTP compartilhado das apps web (singleton por aba), já com refresh
 * automático: um 401 dispara `refreshTokens` uma única vez (single-flight) e
 * repete a requisição original.
 */
export function getApiClient(overrides: Partial<ApiClientOptions> = {}): AxiosInstance {
  if (!browserClient) {
    browserClient = createApiClient({
      baseURL: resolveBaseURL(),
      // Delegam para os ganchos correntes: o provider pode montar depois.
      getAccessToken: () => hooks.getAccessToken?.(),
      getTenantSlug: () => hooks.getTenantSlug?.(),
      refreshTokens: () => hooks.refreshTokens?.() ?? Promise.reject(new Error('sem sessão')),
      onUnauthorized: () => hooks.onUnauthorized?.(),
      ...overrides,
    });
  }
  return browserClient;
}

/** Só para testes — descarta o singleton e os ganchos. */
export function resetApiClient(): void {
  browserClient = null;
  for (const key of Object.keys(hooks) as Array<keyof ApiClientHooks>) {
    delete hooks[key];
  }
}
