'use client';

import { useEffect, type ReactNode } from 'react';
import { Skeleton } from '../components/skeleton';
import { useEstablishmentAuth } from './establishment-auth';

export interface RequireEstablishmentAuthProps {
  children: ReactNode;
  /** Para onde mandar quem não está autenticado. */
  loginUrl: string;
  /** Tela do wizard — quem ainda não configurou a barbearia é levado para lá. */
  onboardingPath?: string;
  /** `true` na própria rota do wizard, para não redirecionar em círculo. */
  isOnboardingRoute?: boolean;
  /** Navegação da app (o `router.replace` do Next). */
  navigate: (url: string) => void;
  fallback?: ReactNode;
}

/**
 * Guarda de rota do painel.
 *
 * Complementa o `middleware.ts` de cada app, que não consegue decidir sozinho:
 * o refresh é httpOnly e escopado em `/api/v1/auth`, então o middleware do Next
 * nem o enxerga. O middleware cuida de `noindex` e das rotas óbvias; a decisão
 * real de sessão acontece aqui, depois que o provider tentou o refresh.
 *
 * Enquanto o refresh está em voo o estado é `loading` — sem isso, todo F5 no
 * painel piscaria a tela de login antes de reconhecer a sessão.
 */
export function RequireEstablishmentAuth({
  children,
  loginUrl,
  onboardingPath,
  isOnboardingRoute = false,
  navigate,
  fallback,
}: RequireEstablishmentAuthProps) {
  const { status, activeMembership, activeTenantId } = useEstablishmentAuth();

  useEffect(() => {
    if (status === 'anonymous') {
      navigate(loginUrl);
      return;
    }

    if (status !== 'authenticated') {
      return;
    }

    const pendingOnboarding = activeMembership !== null && !activeMembership.onboardingDone;

    if (onboardingPath && pendingOnboarding && !isOnboardingRoute && activeTenantId) {
      navigate(onboardingPath);
    }
  }, [status, activeMembership, activeTenantId, loginUrl, onboardingPath, isOnboardingRoute, navigate]);

  if (status !== 'authenticated') {
    return (
      fallback ?? (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6" aria-busy="true">
          <span className="sr-only">Carregando sua sessão…</span>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )
    );
  }

  return <>{children}</>;
}
