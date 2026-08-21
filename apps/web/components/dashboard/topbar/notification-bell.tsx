'use client';

import { useRouter } from 'next/navigation';
import { BellIcon, Popover } from '@barbervp/ui';
import { useNotificationsQuery } from '@/lib/dashboard/api/dashboard';

/**
 * Sino da topbar (`Dashboard.dc.html`, linhas 130–145) — badge vermelho com a
 * contagem e painel de 320px com a lista.
 *
 * O contador é o número de PENDÊNCIAS abertas, não de avisos não lidos: o feed
 * é derivado do banco (ver `notifications.service.ts`), e "lido" exigiria uma
 * tabela de estado por usuário que ainda não existe.
 */
export function NotificationBell() {
  const router = useRouter();
  const query = useNotificationsQuery();
  const count = query.data?.count ?? 0;

  return (
    <Popover
      label={count > 0 ? `Notificações (${count})` : 'Notificações'}
      width={320}
      align="end"
      title="Notificações"
      triggerClassName="relative grid size-11 place-items-center rounded-[9px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg md:size-9"
      trigger={
        <>
          <BellIcon size={18} />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-fg">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </>
      }
    >
      {(close) =>
        query.isLoading ? (
          <p className="px-2.5 py-3 text-[13px] text-fg-muted">Carregando…</p>
        ) : query.isError ? (
          <p className="px-2.5 py-3 text-[13px] text-fg-muted">
            Não foi possível carregar as notificações.
          </p>
        ) : count === 0 ? (
          <p className="px-2.5 py-3 text-[13px] text-fg-muted">Nada pendente por aqui.</p>
        ) : (
          (query.data?.items ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                close();
                router.push(item.href);
              }}
              className="block w-full rounded-lg px-2.5 py-2.5 text-left text-[13px] leading-snug text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {item.text}
            </button>
          ))
        )
      }
    </Popover>
  );
}
