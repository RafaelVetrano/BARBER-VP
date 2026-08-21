'use client';

import { formatRatingBps, type PublicBarbershop } from '@barbervp/types';
import { Avatar, Menu, StarIcon } from '@barbervp/ui';
import { instagramLink, mapsLink, resolveOpenState, whatsappLink } from '@/lib/booking/format';

interface ShopHeroProps {
  shop: PublicBarbershop;
  clientName: string | null;
  onLogin: () => void;
  onLogout: () => void;
  onMyAppointments: () => void;
}

/** Ações rápidas do cabeçalho: WhatsApp, Instagram e rota. */
function QuickAction({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex flex-col items-center gap-1.5">
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={label}
        className="grid size-11 place-items-center rounded-full border border-border text-fg transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        {children}
      </a>
      <span className="text-xs text-fg-muted">{label}</span>
    </span>
  );
}

/**
 * Capa, logo, identificação e ações rápidas.
 *
 * O "Aberto agora · fecha às 20h" é calculado do horário de funcionamento real
 * no fuso da barbearia — no protótipo era um interruptor de demonstração.
 *
 * As ações são âncoras de verdade (`wa.me`, `instagram.com`, Google Maps), não
 * botões com toast "em breve": num celular elas abrem o app instalado, e é esse
 * o caminho que o cliente espera.
 */
export function ShopHero({
  shop,
  clientName,
  onLogin,
  onLogout,
  onMyAppointments,
}: ShopHeroProps) {
  const openState = resolveOpenState(shop.businessHours, shop.timezone);

  return (
    <header>
      <div className="relative">
        <div className="relative h-52 overflow-hidden bg-surface-2 sm:h-64 md:h-72">
          {shop.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL externa arbitrária do dono; o loader do next/image exigiria allowlist de domínio (fase 09, com o storage).
            <img
              src={shop.coverUrl}
              alt=""
              className="size-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          ) : (
            <div className="size-full bg-gradient-to-br from-surface-3 to-bg" />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-bg" />

          <div className="absolute right-4 top-4">
            {clientName ? (
              <Menu
                label="Menu da conta"
                trigger={<Avatar name={clientName} size="sm" />}
                items={[
                  { label: 'Meus agendamentos', onSelect: onMyAppointments },
                  { label: 'Sair', onSelect: onLogout, destructive: true },
                ]}
              />
            ) : (
              <button
                type="button"
                onClick={onLogin}
                className="h-11 rounded-full bg-gold px-5 text-sm font-semibold text-bg transition-colors hover:bg-gold-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                Entrar
              </button>
            )}
          </div>
        </div>

        <div className="absolute -bottom-11 left-5">
          <div className="rounded-full border-[3px] border-bg">
            <Avatar name={shop.name} src={shop.logoUrl} size="lg" className="size-[72px] text-xl" />
          </div>
        </div>
      </div>

      <div className="px-5 pt-14">
        <h1 className="font-display text-2xl font-bold text-fg">{shop.name}</h1>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg-muted">
          {shop.rating && (
            <>
              <StarIcon size={14} className="text-gold" />
              <span className="text-fg">{formatRatingBps(shop.rating.averageBps)}</span>
              <span>
                ({shop.rating.count} {shop.rating.count === 1 ? 'avaliação' : 'avaliações'})
              </span>
            </>
          )}
          {shop.address && <span className="min-w-0 break-words">· {shop.address}</span>}
        </p>

        <p className="mt-2 flex items-center gap-2 text-sm text-fg">
          <span
            aria-hidden="true"
            className={[
              'size-2 shrink-0 rounded-full',
              openState.open ? 'bg-success' : 'bg-danger',
            ].join(' ')}
          />
          {openState.label}
        </p>

        <div className="mt-4 flex gap-3">
          {shop.whatsapp && (
            <QuickAction
              href={whatsappLink(shop.whatsapp, `Olá! Vi a página da ${shop.name}.`)}
              label="WhatsApp"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M4 20l1.2-4.2A8 8 0 1 1 8.6 19L4 20z" />
                <circle cx="9.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
                <circle cx="14.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
              </svg>
            </QuickAction>
          )}

          {shop.instagram && (
            <QuickAction href={instagramLink(shop.instagram)} label="Instagram">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M5 8.5 L9 7.5 L9 15 a3 3 0 1 1 -2 -2.8" />
                <circle cx="16.5" cy="8" r="3.2" />
              </svg>
            </QuickAction>
          )}

          {shop.addressQuery && (
            <QuickAction href={mapsLink(shop.addressQuery)} label="Rota">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M12 21s-6.5-5.4-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.6-6.5 11-6.5 11z" />
                <circle cx="12" cy="10" r="2.2" />
              </svg>
            </QuickAction>
          )}
        </div>
      </div>
    </header>
  );
}
