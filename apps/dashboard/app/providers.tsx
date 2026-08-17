'use client';

import { EstablishmentAuthProvider, QueryProvider, ToastProvider } from '@barbervp/ui';
import type { ReactNode } from 'react';

/**
 * Providers do painel. O `EstablishmentAuthProvider` faz o refresh silencioso
 * ao montar — é o que mantém a sessão viva entre recarregamentos, já que o
 * access token vive só em memória.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <EstablishmentAuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </EstablishmentAuthProvider>
    </QueryProvider>
  );
}
