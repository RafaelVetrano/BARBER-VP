'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AxiosInstance } from 'axios';
import type { AuthMembership, AuthUser, EstablishmentSession } from '@barbervp/types';
import { ApiError } from '../lib/api-client';
import { configureApiClient, getApiClient } from '../lib/browser-client';
import { establishmentApi } from './auth-api';

export interface EstablishmentAuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: AuthUser | null;
  memberships: AuthMembership[];
  activeTenantId: string | null;
  activeMembership: AuthMembership | null;
}

export interface EstablishmentAuthContextValue extends EstablishmentAuthState {
  client: AxiosInstance;
  /** Aplica uma sessão recém-emitida (login, registro, troca de contexto). */
  adopt: (session: EstablishmentSession) => void;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const EstablishmentAuthContext = createContext<EstablishmentAuthContextValue | null>(null);

const ANONYMOUS: EstablishmentAuthState = {
  status: 'anonymous',
  user: null,
  memberships: [],
  activeTenantId: null,
  activeMembership: null,
};

/**
 * Sessão do painel.
 *
 * O access token vive numa `ref` — em memória, nunca em `localStorage`, onde
 * qualquer XSS o leria. Quem o mantém vivo entre recarregamentos é o refresh
 * httpOnly: ao montar, o provider chama `/auth/refresh` uma vez e, se o cookie
 * ainda valer, a sessão volta sem o usuário digitar nada.
 *
 * O interceptor do axios recebe o token pelos ganchos de `configureApiClient`,
 * então qualquer requisição de qualquer parte da app já sai autenticada e com
 * refresh automático em caso de 401.
 */
export function EstablishmentAuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getApiClient(), []);
  const tokenRef = useRef<string | null>(null);
  const [state, setState] = useState<EstablishmentAuthState>({ ...ANONYMOUS, status: 'loading' });

  const applySession = useCallback((session: EstablishmentSession) => {
    tokenRef.current = session.accessToken;
    setState({
      status: 'authenticated',
      user: session.user,
      memberships: session.memberships,
      activeTenantId: session.activeTenantId,
      activeMembership:
        session.memberships.find(
          (membership) => membership.tenantId === session.activeTenantId,
        ) ?? null,
    });
  }, []);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setState(ANONYMOUS);
  }, []);

  const refresh = useCallback(async () => {
    const session = await establishmentApi.refresh(client);
    applySession(session);
  }, [client, applySession]);

  // Liga os ganchos antes do primeiro efeito que faz requisição.
  useEffect(() => {
    configureApiClient({
      getAccessToken: () => tokenRef.current,
      refreshTokens: refresh,
      onUnauthorized: clearSession,
    });
  }, [refresh, clearSession]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const session = await establishmentApi.refresh(client);
        if (!cancelled) {
          applySession(session);
        }
      } catch {
        // Sem cookie válido é o caso normal de quem nunca entrou — não é erro.
        if (!cancelled) {
          clearSession();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, applySession, clearSession]);

  const logout = useCallback(async () => {
    try {
      await establishmentApi.logout(client);
    } finally {
      clearSession();
    }
  }, [client, clearSession]);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      applySession(await establishmentApi.switchContext(client, tenantId));
    },
    [client, applySession],
  );

  const value = useMemo<EstablishmentAuthContextValue>(
    () => ({ ...state, client, adopt: applySession, logout, switchTenant, refresh }),
    [state, client, applySession, logout, switchTenant, refresh],
  );

  return (
    <EstablishmentAuthContext.Provider value={value}>{children}</EstablishmentAuthContext.Provider>
  );
}

export function useEstablishmentAuth(): EstablishmentAuthContextValue {
  const context = useContext(EstablishmentAuthContext);
  if (!context) {
    throw new Error('useEstablishmentAuth precisa de <EstablishmentAuthProvider> acima na árvore.');
  }
  return context;
}

/** Mensagem de erro da API pronta para exibição, com fallback previsível. */
export function authErrorMessage(error: unknown, fallback = 'Não foi possível concluir.'): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** `code` do erro da API — para a tela distinguir `EMAIL_IN_USE` de `OTP_INVALID`. */
export function authErrorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}
