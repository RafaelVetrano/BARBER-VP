'use client';

import { useRouter } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';
import { RequireEstablishmentAuth, useEstablishmentAuth } from '@barbervp/ui';
import { LOGIN_URL } from '../lib/urls';

export interface DashboardGuardProps {
  children: ReactNode;
  /** `true` nas rotas do wizard, para o guard não redirecionar em círculo. */
  isOnboardingRoute?: boolean;
}

/**
 * Guarda das rotas do painel.
 *
 * `navigate` distingue os dois destinos: o login mora em `apps/site`, outra
 * origem, então precisa de `window.location`; as rotas internas usam o router
 * do Next.
 *
 * Também trata o caso do dono com várias barbearias: sem tenant ativo no token,
 * a sessão existe mas não aponta para lugar nenhum, e a app manda para o
 * seletor de contexto.
 */
export function DashboardGuard({ children, isOnboardingRoute = false }: DashboardGuardProps) {
  const router = useRouter();
  const { status, memberships, activeTenantId } = useEstablishmentAuth();

  const navigate = useCallback(
    (url: string) => {
      if (url.startsWith('http')) {
        window.location.assign(url);
        return;
      }
      router.replace(url);
    },
    [router],
  );

  const needsTenantChoice =
    status === 'authenticated' && !activeTenantId && memberships.length > 1;

  if (needsTenantChoice) {
    router.replace('/selecionar-barbearia');
    return null;
  }

  return (
    <RequireEstablishmentAuth
      loginUrl={LOGIN_URL}
      onboardingPath="/configurar"
      isOnboardingRoute={isOnboardingRoute}
      navigate={navigate}
    >
      {children}
    </RequireEstablishmentAuth>
  );
}
