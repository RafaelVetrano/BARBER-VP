'use client';

import { Suspense } from 'react';
import { Skeleton, useEstablishmentAuth } from '@barbervp/ui';
import { OnboardingWizard } from './onboarding-wizard';
import { TenantSetupPending } from './tenant-setup-pending';

/**
 * Quem entra em `/app/configurar` vê o quê.
 *
 * O wizard é `@Roles('OWNER','MANAGER')` na API. Como o guard manda para cá
 * TODO membro de um tenant com onboarding pendente, o `BARBER` chegaria a uma
 * tela que ele não pode carregar — e o painel também está fechado para ele
 * enquanto a configuração não terminar. A bifurcação acontece aqui, antes de
 * qualquer requisição: quem não pode configurar recebe a tela de espera, não um
 * 403 traduzido.
 */
export function OnboardingEntry() {
  const { activeMembership } = useEstablishmentAuth();

  if (activeMembership && activeMembership.role === 'BARBER') {
    return <TenantSetupPending tenantName={activeMembership.tenantName} />;
  }

  // `Suspense` porque o wizard lê `?passo=` com `useSearchParams`, e no App
  // Router isso obriga uma fronteira — sem ela o build reprova a rota inteira.
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <OnboardingWizard />
    </Suspense>
  );
}

function WizardSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10" aria-busy="true">
      <span className="sr-only">Carregando a configuração da sua barbearia…</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
