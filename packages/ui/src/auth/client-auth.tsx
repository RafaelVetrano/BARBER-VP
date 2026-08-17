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
import type { AuthClient, ClientSession } from '@barbervp/types';
import { configureApiClient, getApiClient } from '../lib/browser-client';
import { clientApi } from './auth-api';

export interface ClientAuthContextValue {
  status: 'loading' | 'authenticated' | 'anonymous';
  client: AuthClient | null;
  api: AxiosInstance;
  adopt: (session: ClientSession) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextValue | null>(null);

/**
 * Sessão do cliente final (`apps/booking`).
 *
 * Mesma mecânica da sessão do painel — token em memória, refresh em cookie
 * httpOnly —, mas com cookie e `audience` próprios: o dono pode estar logado no
 * painel numa aba e agendando como cliente na outra sem uma sessão pisar na
 * outra.
 */
export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => getApiClient(), []);
  const tokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ClientAuthContextValue['status']>('loading');
  const [client, setClient] = useState<AuthClient | null>(null);

  const applySession = useCallback((session: ClientSession) => {
    tokenRef.current = session.accessToken;
    setClient(session.client);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setClient(null);
    setStatus('anonymous');
  }, []);

  const refresh = useCallback(async () => {
    applySession(await clientApi.refresh(api));
  }, [api, applySession]);

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
        const session = await clientApi.refresh(api);
        if (!cancelled) applySession(session);
      } catch {
        if (!cancelled) clearSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, applySession, clearSession]);

  const logout = useCallback(async () => {
    try {
      await clientApi.logout(api);
    } finally {
      clearSession();
    }
  }, [api, clearSession]);

  const value = useMemo<ClientAuthContextValue>(
    () => ({ status, client, api, adopt: applySession, logout, refresh }),
    [status, client, api, applySession, logout, refresh],
  );

  return <ClientAuthContext.Provider value={value}>{children}</ClientAuthContext.Provider>;
}

export function useClientAuth(): ClientAuthContextValue {
  const context = useContext(ClientAuthContext);
  if (!context) {
    throw new Error('useClientAuth precisa de <ClientAuthProvider> acima na árvore.');
  }
  return context;
}
