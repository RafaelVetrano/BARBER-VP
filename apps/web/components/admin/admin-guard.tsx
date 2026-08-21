'use client';

import { useEffect, type ReactNode } from 'react';
import { Skeleton, useEstablishmentAuth } from '@barbervp/ui';
import { LOGIN_URL } from '@/lib/urls';

/**
 * Guarda do super admin — diferente do `DashboardGuard`: aqui NÃO existe
 * conceito de tenant/membership/onboarding, só `user.isSuperAdmin`. Quem
 * loga com uma conta de estabelecimento comum (OWNER/MANAGER/BARBER) é
 * mandado de volta pro login — não tem nada pra ver aqui, e o backend já
 * devolveria 403 em toda rota `/admin/*` mesmo que a tela deixasse passar.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { status, user } = useEstablishmentAuth();

  useEffect(() => {
    if (status === 'anonymous') {
      window.location.assign(LOGIN_URL);
      return;
    }
    if (status === 'authenticated' && !user?.isSuperAdmin) {
      window.location.assign(LOGIN_URL);
    }
  }, [status, user]);

  if (status !== 'authenticated' || !user?.isSuperAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6" aria-busy="true">
        <span className="sr-only">Carregando sua sessão…</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
