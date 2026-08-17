'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuthClient, PublicBarbershop } from '@barbervp/types';
import { useClientAuth, useToast } from '@barbervp/ui';
import { ClienteAuthSheet, type ClienteAuthMode } from '../cliente-auth';
import { BookingWizard } from '../wizard/booking-wizard';
import { MinhaContaSheet, type MinhaContaTab } from '../minha-conta';
import { AssinaturaClienteSheet } from '../assinatura-cliente';
import { bookingApi } from '../../lib/booking-api';
import { ShopHero } from './shop-hero';
import {
  AboutSection,
  LocationSection,
  PlansSection,
  ReviewsSection,
  ServicesSection,
  TeamSection,
} from './shop-sections';

interface BarbershopPageProps {
  /** Renderizado no servidor e entregue já pronto — ver `app/[slug]/page.tsx`. */
  initialShop: PublicBarbershop;
}

/**
 * Página pública da barbearia.
 *
 * Recebe do servidor o conteúdo já renderizado (é página indexada) e, depois da
 * hidratação, revalida com a sessão do cliente: o que muda com login é o
 * cabeçalho ("Entrar" vira o avatar) e a seção de assinatura. Sem essa segunda
 * busca, o HTML de um assinante seria idêntico ao de um visitante — que é
 * exatamente o que permite cachear a primeira versão para todo mundo.
 */
export function BarbershopPage({ initialShop }: BarbershopPageProps) {
  const { client, status, logout, api } = useClientAuth();
  const { toast } = useToast();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<ClienteAuthMode>('login');
  const [scrolled, setScrolled] = useState(false);
  const [minhaContaOpen, setMinhaContaOpen] = useState(false);
  const [minhaContaTab, setMinhaContaTab] = useState<MinhaContaTab>('agendamentos');
  const [assinaturaPlanId, setAssinaturaPlanId] = useState<string | null>(null);
  /** Plano que a pessoa tentou assinar sem estar logada — retomado após o login. */
  const [pendingPlanAfterAuth, setPendingPlanAfterAuth] = useState<string | null>(null);

  const { data: shop = initialShop } = useQuery({
    queryKey: ['booking', 'page', initialShop.slug, client?.id ?? null],
    queryFn: () => bookingApi.page(api, initialShop.slug),
    initialData: initialShop,
    // Só vale a pena refazer a busca quando há sessão: é ela que acrescenta
    // dado à resposta.
    enabled: status !== 'loading' && Boolean(client),
    staleTime: 60_000,
  });

  // O CTA fixo só aparece depois que o cliente rola — no topo, o botão da capa
  // já está à vista, e dois botões iguais na mesma tela competem entre si.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 160);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openWizard = useCallback((serviceId: string | null) => {
    setPendingServiceId(serviceId);
    setWizardOpen(true);
  }, []);

  const openAuth = useCallback((mode: ClienteAuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  const openMinhaConta = useCallback((tab: MinhaContaTab = 'agendamentos') => {
    setMinhaContaTab(tab);
    setMinhaContaOpen(true);
  }, []);

  const bookingEnabled = shop.allowOnlineBooking;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col bg-bg">
      <ShopHero
        shop={shop}
        clientName={client?.name ?? null}
        onLogin={() => openAuth('login')}
        onLogout={() => void logout()}
        onMyAppointments={() => openMinhaConta('agendamentos')}
      />

      {bookingEnabled && (
        <div className="px-5 pt-5">
          <button
            type="button"
            onClick={() => openWizard(null)}
            className="h-[52px] w-full rounded-xl bg-gold text-base font-semibold text-bg transition-colors hover:bg-gold-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Agendar horário
          </button>
        </div>
      )}

      {!bookingEnabled && (
        <p className="mx-5 mt-5 rounded-xl border border-border p-4 text-sm text-fg-muted">
          Esta barbearia não está aceitando agendamento online no momento. Fale com a equipe pelo
          WhatsApp.
        </p>
      )}

      <main className="pb-8">
        {shop.sections.services && <ServicesSection shop={shop} onBook={openWizard} />}
        <PlansSection
          shop={shop}
          onSubscribe={(planId) => setAssinaturaPlanId(planId)}
          onManageSubscription={() => openMinhaConta('assinatura')}
        />
        <TeamSection shop={shop} />
        <AboutSection shop={shop} />
        <ReviewsSection shop={shop} />
        <LocationSection shop={shop} />
      </main>

      <footer className="px-5 pb-8 pt-2 text-center text-xs text-fg-muted">
        Feito com ⚡ BarberVP
      </footer>

      {/* CTA fixo do mobile. Some a partir de `sm`, onde o botão do topo
          continua visível sem rolagem. */}
      {bookingEnabled && scrolled && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center border-t border-border bg-bg/85 backdrop-blur sm:hidden">
          <div className="w-full max-w-[560px] p-3 px-5">
            <button
              type="button"
              onClick={() => openWizard(null)}
              className="h-[52px] w-full rounded-xl bg-gold text-base font-semibold text-bg transition-colors hover:bg-gold-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Agendar horário
            </button>
          </div>
        </div>
      )}

      {/* Espaço para o CTA fixo não cobrir o rodapé. */}
      {bookingEnabled && scrolled && <div aria-hidden="true" className="h-20 sm:hidden" />}

      <BookingWizard
        shop={shop}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialServiceId={pendingServiceId}
        onRequestLogin={() => openAuth('login')}
        onRequestRegister={() => openAuth('registro')}
      />

      <ClienteAuthSheet
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={(authenticated: AuthClient) => {
          toast({ message: `Bem-vindo, ${authenticated.name.split(' ')[0]}!`, tone: 'success' });
          // Quem tentou assinar sem conta retoma exatamente de onde parou —
          // login não pode jogar fora a escolha de plano que já tinha feito.
          if (pendingPlanAfterAuth) {
            setAssinaturaPlanId(pendingPlanAfterAuth);
            setPendingPlanAfterAuth(null);
          }
        }}
      />

      <MinhaContaSheet
        open={minhaContaOpen}
        onClose={() => setMinhaContaOpen(false)}
        slug={shop.slug}
        initialTab={minhaContaTab}
        onNovoAgendamento={openWizard}
        onSubscribe={(planId) => setAssinaturaPlanId(planId)}
      />

      <AssinaturaClienteSheet
        open={assinaturaPlanId !== null}
        onClose={() => setAssinaturaPlanId(null)}
        slug={shop.slug}
        planId={assinaturaPlanId}
        onRequestAuth={(planId) => {
          setPendingPlanAfterAuth(planId);
          setAssinaturaPlanId(null);
          openAuth('login');
        }}
        onScheduleNow={() => openWizard(null)}
        onViewSubscription={() => openMinhaConta('assinatura')}
      />
    </div>
  );
}
