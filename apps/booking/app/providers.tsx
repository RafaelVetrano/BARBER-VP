'use client';

import { ClientAuthProvider, QueryProvider, ToastProvider } from '@barbervp/ui';
import type { ReactNode } from 'react';

/**
 * Providers do booking.
 *
 * A sessão aqui é a do CLIENTE (`ClientAuthProvider`), com cookie e audience
 * próprios: o dono pode estar logado no painel numa aba e agendando como
 * cliente nesta, sem uma sessão derrubar a outra.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ClientAuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </ClientAuthProvider>
    </QueryProvider>
  );
}
