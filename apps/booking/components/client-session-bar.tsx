'use client';

import { useState } from 'react';
import { Avatar, Button, Skeleton, useClientAuth } from '@barbervp/ui';
import { ClienteAuthSheet, type ClienteAuthMode } from './cliente-auth';

export interface ClientSessionBarProps {
  /** Abre a `MinhaConta` — ausente quando quem renderiza não tem onde abri-la. */
  onOpenAccount?: () => void;
}

/**
 * Barra de sessão do cliente na página pública.
 *
 * Serve de ponto de entrada do `ClienteAuth` fora do wizard de agendamento — o
 * mesmo sheet, aberto por outro lugar, que é exatamente o motivo de ele ser
 * componente e não página. Logado, o próprio nome/avatar é o atalho para a
 * `MinhaConta` (fase 05) — o "Sair" continua com botão próprio, para um toque
 * errado não derrubar a sessão.
 */
export function ClientSessionBar({ onOpenAccount }: ClientSessionBarProps) {
  const { status, client, logout } = useClientAuth();
  const [sheet, setSheet] = useState<ClienteAuthMode | null>(null);

  if (status === 'loading') {
    return <Skeleton className="h-11 w-48" />;
  }

  return (
    <>
      {status === 'authenticated' && client ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenAccount}
            disabled={!onOpenAccount}
            className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default"
          >
            <Avatar name={client.name} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-fg">{client.name}</span>
              <span className="block truncate text-xs text-fg-subtle">Minha conta</span>
            </span>
          </button>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sair
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" onClick={() => setSheet('login')}>
            Entrar
          </Button>
          <Button onClick={() => setSheet('registro')}>Criar conta</Button>
        </div>
      )}

      <ClienteAuthSheet
        open={sheet !== null}
        initialMode={sheet ?? 'login'}
        onClose={() => setSheet(null)}
      />
    </>
  );
}
