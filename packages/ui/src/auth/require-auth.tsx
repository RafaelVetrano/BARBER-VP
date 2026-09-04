'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Skeleton } from '../components/skeleton';
import { useEstablishmentAuth } from './establishment-auth';

/** O que o guard decide, dado o estado da sessão. Ver `resolveGuardAction`. */
export type GuardAction =
  | { kind: 'wait' }
  | { kind: 'login' }
  | { kind: 'onboarding' }
  | { kind: 'dashboard' }
  | { kind: 'render' };

export interface GuardInput {
  status: 'loading' | 'authenticated' | 'anonymous';
  /** `null` quando a sessão ainda não aponta para uma barbearia. */
  onboardingDone: boolean | null;
  activeTenantId: string | null;
  /** `true` na própria rota do wizard. */
  isOnboardingRoute: boolean;
  /**
   * `true` quando o onboarding já estava concluído na PRIMEIRA avaliação desta
   * montagem. Distingue "abriu `/app/configurar` com tudo pronto" (vai para o
   * painel) de "acabou de concluir agora" (fica para ver a tela final).
   */
  completedOnEntry: boolean;
}

/**
 * A decisão do guard, isolada da árvore React para poder ser testada.
 *
 * **Por que ela existe** (agente 30): a obrigatoriedade do wizard é regra de
 * produto — "concluir a configuração inicial é obrigatório para acessar o
 * painel" — e regra de produto sem teste é regra que volta a quebrar. A suíte
 * de frontend roda em `node`, sem DOM, então a decisão precisa ser uma função
 * pura para caber nela.
 *
 * As quatro saídas, na ordem em que importam:
 *
 * 1. sessão indefinida → `wait` (skeleton; sem isto todo F5 pisca o login);
 * 2. anônimo → `login`;
 * 3. onboarding pendente fora do wizard → `onboarding`, **sem renderizar o
 *    filho**. Antes o filho renderizava enquanto o `useEffect` navegava, e uma
 *    tela do painel chegava a montar e disparar requisições durante o redirect;
 * 4. onboarding já concluído ao ENTRAR no wizard → `dashboard`. O wizard não
 *    reabre depois de pronto — mas quem acabou de concluí-lo nesta mesma
 *    montagem continua vendo a tela de conclusão, que é onde está o link
 *    público que o dono veio buscar.
 */
export function resolveGuardAction(input: GuardInput): GuardAction {
  if (input.status === 'anonymous') return { kind: 'login' };
  if (input.status !== 'authenticated') return { kind: 'wait' };

  // Sessão sem barbearia ativa (ou sem membership resolvido) não tem onboarding
  // a exigir: quem decide é o seletor de contexto, não este guard.
  if (input.onboardingDone === null || !input.activeTenantId) return { kind: 'render' };

  if (!input.onboardingDone) {
    return input.isOnboardingRoute ? { kind: 'render' } : { kind: 'onboarding' };
  }

  if (input.isOnboardingRoute && input.completedOnEntry) return { kind: 'dashboard' };

  return { kind: 'render' };
}

export interface RequireEstablishmentAuthProps {
  children: ReactNode;
  /** Para onde mandar quem não está autenticado. */
  loginUrl: string;
  /** Tela do wizard — quem ainda não configurou a barbearia é levado para lá. */
  onboardingPath?: string;
  /** Home do painel — para onde vai quem abre o wizard com tudo já configurado. */
  dashboardPath?: string;
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
 *
 * A lógica de decisão mora em `resolveGuardAction`, que é pura e testada; aqui
 * fica só o que precisa de React: o efeito que navega e o que se renderiza
 * enquanto isso.
 */
export function RequireEstablishmentAuth({
  children,
  loginUrl,
  onboardingPath,
  dashboardPath,
  isOnboardingRoute = false,
  navigate,
  fallback,
}: RequireEstablishmentAuthProps) {
  const { status, activeMembership, activeTenantId } = useEstablishmentAuth();

  const onboardingDone = activeMembership === null ? null : activeMembership.onboardingDone;

  // Fotografia do estado na PRIMEIRA avaliação autenticada desta montagem. É o
  // que separa "chegou aqui com tudo pronto" de "concluiu agora": sem ela, o
  // `refresh()` do fim do wizard viraria `onboardingDone: true` e o guard
  // arrancaria o dono da tela de conclusão antes de ele copiar o link.
  const completedOnEntry = useRef<boolean | null>(null);
  if (completedOnEntry.current === null && status === 'authenticated' && onboardingDone !== null) {
    completedOnEntry.current = onboardingDone;
  }

  const action = resolveGuardAction({
    status,
    onboardingDone,
    activeTenantId,
    isOnboardingRoute,
    completedOnEntry: completedOnEntry.current ?? false,
  });

  useEffect(() => {
    if (action.kind === 'login') navigate(loginUrl);
    if (action.kind === 'onboarding' && onboardingPath) navigate(onboardingPath);
    if (action.kind === 'dashboard' && dashboardPath) navigate(dashboardPath);
  }, [action.kind, loginUrl, onboardingPath, dashboardPath, navigate]);

  if (action.kind !== 'render') {
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
