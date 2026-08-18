'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createApiClient, useEstablishmentAuth } from '@barbervp/ui';
import { SpinnerIcon } from '@barbervp/ui';
import type { AuthMembership, AuthUser } from '@barbervp/types';
import { markImpersonating } from '../../lib/impersonation';

type MeResponse = AuthUser & { memberships: AuthMembership[] };

/**
 * Recebe a impersonação vinda de `apps/admin` — origem diferente, por isso o
 * hand-off é por URL: `?tenant=&slug=&owner=` (não sensível) + `#token=` no
 * FRAGMENTO (nunca vai para log de servidor nem `Referer`).
 *
 * Usa um axios AVULSO (`createApiClient`, não o `client` do provider) para o
 * primeiro `/auth/me` — o `EstablishmentAuthProvider` já dispara seu próprio
 * `/auth/refresh` silencioso ao montar, e usar o mesmo client aqui correria
 * risco de o token da impersonação ser pisado por uma sessão antiga do
 * navegador antes de `adopt()` rodar.
 */
export default function ImpersonarPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { adopt } = useEstablishmentAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tenantId = params.get('tenant');
    const tenantSlug = params.get('slug') ?? '';
    const token = typeof window !== 'undefined' ? window.location.hash.replace(/^#token=/, '') : '';

    if (!tenantId || !token) {
      setError('Link de impersonação inválido ou incompleto.');
      return;
    }

    const bootstrap = createApiClient({
      baseURL: process.env.NEXT_PUBLIC_API_URL!,
      getAccessToken: () => token,
    });

    void (async () => {
      try {
        const me = await bootstrap.get<MeResponse>('/auth/me');
        adopt({
          accessToken: token,
          expiresIn: 900,
          user: {
            id: me.data.id,
            name: me.data.name,
            email: me.data.email,
            phone: me.data.phone,
            isSuperAdmin: me.data.isSuperAdmin,
            hasClientAccount: me.data.hasClientAccount,
          },
          memberships: me.data.memberships,
          activeTenantId: tenantId,
        });
        markImpersonating({ ownerName: me.data.name, tenantSlug });
        router.replace('/');
      } catch {
        setError('Não foi possível iniciar a impersonação — o link pode ter expirado.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
      {error ? (
        <>
          <p className="font-display text-lg font-bold text-fg">Não foi possível entrar</p>
          <p className="text-sm text-fg-muted">{error}</p>
        </>
      ) : (
        <>
          <SpinnerIcon size={28} className="animate-spin text-gold" />
          <p className="text-sm text-fg-muted">Entrando como o dono da barbearia…</p>
        </>
      )}
    </div>
  );
}
