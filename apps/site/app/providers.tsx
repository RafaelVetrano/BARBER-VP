'use client';

import { EstablishmentAuthProvider, QueryProvider, ToastProvider } from '@barbervp/ui';
import type { ReactNode } from 'react';

/**
 * Providers de cliente da app.
 *
 * O `EstablishmentAuthProvider` tenta um refresh silencioso ao montar: quem já
 * tem cookie válido continua logado ao voltar ao site, e o login não pisca.
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
