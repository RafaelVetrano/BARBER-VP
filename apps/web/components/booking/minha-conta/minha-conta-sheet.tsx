'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, Tabs, useClientAuth, type TabItem } from '@barbervp/ui';
import { clientAccountApi } from '@/lib/booking/client-account-api';
import { TabAgendamentos } from './tab-agendamentos';
import { TabAssinatura } from './tab-assinatura';
import { TabDados } from './tab-dados';

export type MinhaContaTab = 'agendamentos' | 'assinatura' | 'dados';

export interface MinhaContaSheetProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  initialTab?: MinhaContaTab;
  /** Abre o wizard de agendamento — "Agendar horário" / "Agendar de novo". */
  onNovoAgendamento: (serviceId: string | null) => void;
  /** Abre a `AssinaturaCliente` num plano específico. */
  onSubscribe: (planId: string) => void;
}

const TITLES: Record<MinhaContaTab, string> = {
  agendamentos: 'Agendamentos',
  assinatura: 'Assinatura',
  dados: 'Meus dados',
};

/**
 * `MinhaConta` — as 3 abas reais (`MinhaConta.dc.html`): Agendamentos
 * (Próximos/Histórico), Assinatura (só quando o tenant tem
 * `fidelidadeAssinaturas` no plano do SaaS) e Meus dados.
 *
 * É componente, não rota — o mesmo padrão do `ClienteAuth`/`BookingWizard`:
 * abre por cima da página pública, `open`/`onClose`, e delega para fora o que
 * não é dela (agendar de novo abre o wizard; assinar abre a
 * `AssinaturaCliente`).
 */
export function MinhaContaSheet({
  open,
  onClose,
  slug,
  initialTab = 'agendamentos',
  onNovoAgendamento,
  onSubscribe,
}: MinhaContaSheetProps) {
  const { api, client } = useClientAuth();
  const [tab, setTab] = useState<MinhaContaTab>(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  // Decide a visibilidade da aba "Assinatura" — o mesmo `queryKey` que
  // `TabAssinatura` usa, então não dobra a requisição quando a aba abre.
  const gateQuery = useQuery({
    queryKey: ['minha-conta', 'subscription', slug],
    queryFn: () => clientAccountApi.subscription(api, slug),
    enabled: open,
  });

  const showAssinatura = gateQuery.data?.enabled === true;

  const items: TabItem<MinhaContaTab>[] = [
    { value: 'agendamentos', label: 'Agendamentos' },
    ...(showAssinatura ? [{ value: 'assinatura' as const, label: 'Assinatura' }] : []),
    { value: 'dados', label: 'Meus dados' },
  ];

  // A aba "Assinatura" pode sumir depois de escolhida (gate ainda carregando
  // no primeiro render) — cai de volta em "Agendamentos" em vez de mostrar um
  // painel vazio.
  useEffect(() => {
    if (tab === 'assinatura' && gateQuery.isFetched && !showAssinatura) {
      setTab('agendamentos');
    }
  }, [tab, gateQuery.isFetched, showAssinatura]);

  if (!client) return null;

  return (
    <Modal open={open} onClose={onClose} title={TITLES[tab]} aria-label={TITLES[tab]}>
      <div className="flex flex-col gap-5">
        <Tabs
          items={items}
          value={tab}
          onChange={setTab}
          label="Minha conta"
          idPrefix="minha-conta-tab"
          className="-mx-5 px-5"
        />

        {tab === 'agendamentos' && (
          <TabAgendamentos slug={slug} onNovoAgendamento={(serviceId) => { onClose(); onNovoAgendamento(serviceId); }} />
        )}

        {tab === 'assinatura' && showAssinatura && (
          <TabAssinatura slug={slug} onSubscribe={(planId) => { onClose(); onSubscribe(planId); }} />
        )}

        {tab === 'dados' && <TabDados onClose={onClose} />}
      </div>
    </Modal>
  );
}
