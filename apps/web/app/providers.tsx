'use client';

import {
  ClientAuthProvider,
  EstablishmentAuthProvider,
  QueryProvider,
  ToastProvider,
} from '@barbervp/ui';
import type { ReactNode } from 'react';

/**
 * Providers das superfícies com sessão.
 *
 * Cada route group monta o seu — o `QueryProvider` cria um `QueryClient` por
 * montagem, então `(dashboard)` e `(admin)` têm caches independentes e a landing
 * não instancia nenhum.
 *
 * São DOIS públicos distintos, com cookie e audience próprios: o dono pode estar
 * logado no painel numa aba e agendando como cliente noutra, sem uma sessão
 * derrubar a outra.
 */

/**
 * Sessão de ESTABELECIMENTO (`/entrar`, `/app/*`, `/admin/*`). O
 * `EstablishmentAuthProvider` tenta um refresh silencioso ao montar — é o que
 * mantém a sessão viva entre recarregamentos, já que o access token vive só em
 * memória. O `SUPER_ADMIN` usa a MESMA sessão: é um `User` com a flag
 * `isSuperAdmin`, não uma audiência à parte.
 */
export function EstablishmentProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <EstablishmentAuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </EstablishmentAuthProvider>
    </QueryProvider>
  );
}

/** Sessão do CLIENTE final (booking público). */
export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ClientAuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </ClientAuthProvider>
    </QueryProvider>
  );
}
