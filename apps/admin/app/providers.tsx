'use client';

import { EstablishmentAuthProvider, QueryProvider, ToastProvider } from '@barbervp/ui';
import type { ReactNode } from 'react';

/**
 * Providers do super admin.
 *
 * Usa a MESMA sessão de estabelecimento: o `SUPER_ADMIN` é um `User` com a
 * flag `isSuperAdmin`, não uma audiência à parte. As telas chegam na fase 08;
 * a sessão já fica ligada aqui para o interceptor de refresh valer desde já.
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
