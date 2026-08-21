'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  ChevronRightIcon,
  Skeleton,
  authErrorMessage,
  useEstablishmentAuth,
} from '@barbervp/ui';
import { LOGIN_URL } from '@/lib/urls';

/**
 * Seletor de contexto: um `User` com `Membership` em N barbearias escolhe
 * qual abrir.
 *
 * A troca NÃO é um estado do frontend — é `POST /auth/context`, que emite um
 * par de tokens novo apontando para a outra barbearia. Nenhuma rota de negócio
 * aceita `tenantId`; o tenant vive dentro do token, e é por isso que o
 * isolamento continua valendo mesmo com o usuário trocando de contexto.
 */
export function TenantSelector() {
  const router = useRouter();
  const { status, memberships, activeTenantId, switchTenant } = useEstablishmentAuth();
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'anonymous') {
      window.location.assign(LOGIN_URL);
    }
  }, [status]);

  // Com um vínculo só não há o que escolher.
  useEffect(() => {
    if (status === 'authenticated' && memberships.length === 1 && activeTenantId) {
      router.replace('/app');
    }
  }, [status, memberships.length, activeTenantId, router]);

  const choose = async (tenantId: string, onboardingDone: boolean) => {
    setSwitching(tenantId);
    setError(null);
    try {
      await switchTenant(tenantId);
      router.replace(onboardingDone ? '/app' : '/app/configurar');
    } catch (caught) {
      setError(authErrorMessage(caught, 'Não foi possível abrir esta barbearia.'));
      setSwitching(null);
    }
  };

  if (status !== 'authenticated') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 p-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <h1 className="mb-2 font-display text-2xl font-bold tracking-tight text-fg">
        Escolha a barbearia
      </h1>
      <p className="mb-6 text-sm text-fg-muted">
        Sua conta atende mais de uma barbearia. Você pode trocar quando quiser.
      </p>

      <ul className="flex flex-col gap-2.5">
        {memberships.map((membership) => (
          <li key={membership.tenantId}>
            <button
              type="button"
              onClick={() => void choose(membership.tenantId, membership.onboardingDone)}
              disabled={switching !== null}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-gold disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">
                  {membership.tenantName}
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  /agendar/{membership.tenantSlug}
                </span>
              </span>

              <Badge tone={membership.role === 'OWNER' ? 'gold' : 'neutral'}>
                {membership.role === 'OWNER'
                  ? 'Dono'
                  : membership.role === 'MANAGER'
                    ? 'Gerente'
                    : 'Barbeiro'}
              </Badge>

              {!membership.onboardingDone && <Badge tone="warning">Configurar</Badge>}

              <ChevronRightIcon size={18} className="shrink-0 text-fg-subtle" />
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {error}
        </p>
      )}

      <Button
        variant="ghost"
        onClick={() => window.location.assign(LOGIN_URL)}
        className="mt-6 self-center"
      >
        Entrar com outra conta
      </Button>
    </main>
  );
}
