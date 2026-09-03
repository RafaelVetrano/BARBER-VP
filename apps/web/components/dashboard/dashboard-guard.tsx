'use client';

import { useRouter } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';
import { RequireEstablishmentAuth, useEstablishmentAuth } from '@barbervp/ui';
import { LOGIN_URL } from '@/lib/urls';

export interface DashboardGuardProps {
  children: ReactNode;
  /** `true` nas rotas do wizard, para o guard não redirecionar em círculo. */
  isOnboardingRoute?: boolean;
}

/**
 * Guarda das rotas do painel.
 *
 * `navigate` distingue os dois destinos: ir para o LOGIN é sempre navegação
 * dura (`window.location`); as rotas internas do painel continuam no router do
 * Next.
 *
 * **Reavaliado pelo agente 29**, depois de corrigido o deadlock do interceptor
 * de refresh que era o motivo original de a dívida ficar em pé — e MANTIDO,
 * agora por um motivo próprio: `(dashboard)`, `(admin)` e `(marketing)/(auth)`
 * montam, cada um, o SEU `EstablishmentAuthProvider`, e cada provider dispara
 * um refresh ao montar. Numa navegação SUAVE entre grupos as duas árvores
 * coexistem por um instante, e duas POSTs simultâneas em `/auth/refresh`
 * rotacionam o cookie e fazem a segunda cair na detecção de reuso, que revoga
 * a FAMÍLIA inteira de tokens — o mesmo incidente que a auditoria da aba
 * Comandas já pagou uma vez. A navegação dura derruba a árvore antiga antes de
 * montar a nova e não tem essa janela.
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
      if (url.startsWith('http') || url === LOGIN_URL) {
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
    router.replace('/app/selecionar-barbearia');
    return null;
  }

  return (
    <RequireEstablishmentAuth
      loginUrl={LOGIN_URL}
      onboardingPath="/app/configurar"
      isOnboardingRoute={isOnboardingRoute}
      navigate={navigate}
    >
      {children}
    </RequireEstablishmentAuth>
  );
}
