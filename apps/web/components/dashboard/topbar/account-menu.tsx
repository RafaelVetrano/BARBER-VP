'use client';

import { useRouter } from 'next/navigation';
import {
  Avatar,
  ChevronDownIcon,
  Popover,
  PopoverDivider,
  PopoverItem,
  useEstablishmentAuth,
} from '@barbervp/ui';

/**
 * Menu do avatar (`Dashboard.dc.html`, linhas 147–160): "Meu perfil",
 * "Configurações", divisor e "Sair" em vermelho.
 *
 * Antes da fase 13 este menu tinha só o e-mail (desabilitado) e "Sair" — os
 * dois itens de navegação estavam faltando.
 */
export function AccountMenu() {
  const router = useRouter();
  const { user, activeMembership, logout } = useEstablishmentAuth();
  const name = user?.name ?? '?';

  return (
    <Popover
      label="Sua conta"
      width={200}
      align="end"
      triggerClassName="flex size-11 items-center justify-center gap-2 rounded-[9px] transition-colors hover:bg-surface-2 md:size-auto md:p-1"
      trigger={
        <>
          <Avatar name={name} size="sm" />
          <ChevronDownIcon size={14} className="hidden shrink-0 text-fg-muted sm:block" />
        </>
      }
    >
      {(close) => (
        <>
          {/* No desktop o menu do protótipo tem só os três itens. O cabeçalho
              existe apenas no bottom-sheet, onde o painel ocupa a tela inteira
              e precisa dizer de quem é a conta. */}
          <div className="px-2.5 pb-2 pt-1 md:hidden">
            <p className="truncate text-[13px] font-semibold text-fg">{name}</p>
            <p className="truncate text-xs text-fg-muted">{activeMembership?.tenantName}</p>
          </div>
          <PopoverItem
            onSelect={() => {
              close();
              router.push('/app/configuracoes?tab=perfil');
            }}
          >
            Meu perfil
          </PopoverItem>
          <PopoverItem
            onSelect={() => {
              close();
              router.push('/app/configuracoes');
            }}
          >
            Configurações
          </PopoverItem>
          <PopoverDivider />
          <PopoverItem
            destructive
            onSelect={() => {
              close();
              void logout().then(() => router.replace('/app'));
            }}
          >
            Sair
          </PopoverItem>
        </>
      )}
    </Popover>
  );
}
