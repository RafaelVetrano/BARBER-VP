'use client';

import { useEffect, useState } from 'react';
import { useEstablishmentAuth } from '@barbervp/ui';
import { clearImpersonation, impersonationInfo, type ImpersonationInfo } from '../lib/impersonation';

/**
 * Banner obrigatório de impersonação (fase 08 — regra 6: "banner visual
 * obrigatório na sessão impersonada"). Fixo no topo, sempre visível, cor de
 * alerta — não dá pra confundir com o resto do painel.
 */
export function ImpersonationBanner() {
  const { logout } = useEstablishmentAuth();
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);

  useEffect(() => {
    setInfo(impersonationInfo());
  }, []);

  if (!info) return null;

  const exit = () => {
    clearImpersonation();
    void logout().finally(() => {
      window.location.assign(process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3003');
    });
  };

  return (
    <div className="flex h-10 shrink-0 items-center justify-center gap-3 bg-warning px-4 text-center text-[13px] font-semibold text-bg">
      <span>
        Modo impersonação — você está vendo como <strong>{info.ownerName}</strong> ({info.tenantSlug})
      </span>
      <button type="button" onClick={exit} className="underline underline-offset-2">
        Sair da impersonação
      </button>
    </div>
  );
}
