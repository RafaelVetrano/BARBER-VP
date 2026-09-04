'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { WHATSAPP_EVENT_ORDER, type WhatsappEvent } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { UpgradeModal } from '@/components/dashboard/upgrade-modal';
import { useDashboardShellQuery } from '@/lib/dashboard/api/dashboard';
import {
  useWhatsappAutomationsQuery,
  useWhatsappConnectionQuery,
  useWhatsappHistoryQuery,
  useWhatsappReactivationQuery,
} from '@/lib/dashboard/api/whatsapp';
import { AutomationsCard } from '@/components/dashboard/whatsapp/automations-card';
import { ConnectionCard } from '@/components/dashboard/whatsapp/connection-card';
import { HistoryTable } from '@/components/dashboard/whatsapp/history-table';
import { MessageEditorModal } from '@/components/dashboard/whatsapp/message-editor-modal';
import { ReactivationBanner } from '@/components/dashboard/whatsapp/reactivation-banner';
import {
  WHATSAPP_MIN_PLAN_LABEL,
  WHATSAPP_UPGRADE_BENEFITS,
  WHATSAPP_UPGRADE_DESCRIPTION,
} from '@/components/dashboard/whatsapp/automation-labels';

/**
 * Aba WhatsApp — `Dashboard.dc.html` l.1624–1722.
 *
 * Ordem dos blocos, de cima para baixo, igual à do protótipo: conexão →
 * automações → faixa de reativação → histórico de envios. Cada bloco tem a
 * própria consulta, o próprio esqueleto e o próprio retry: o histórico cair
 * não pode levar as automações junto.
 */
function WhatsappScreen() {
  const params = useSearchParams();
  const shellQuery = useDashboardShellQuery();
  const automationsQuery = useWhatsappAutomationsQuery();
  const connectionQuery = useWhatsappConnectionQuery();
  const reactivationQuery = useWhatsappReactivationQuery();
  const historyQuery = useWhatsappHistoryQuery();

  const [editing, setEditing] = useState<WhatsappEvent | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const items = automationsQuery.data?.items;

  /**
   * A faixa de alertas do Dashboard manda para cá com `?evento=REACTIVATION` e
   * `?evento=BIRTHDAY` (`alerts-strip.tsx`). Antes o parâmetro era ignorado e
   * os dois botões caíam numa lista sem nada aberto — agora abrem o editor da
   * automação correspondente.
   */
  useEffect(() => {
    const requested = params.get('evento');
    if (!requested || !items) return;
    if (!(WHATSAPP_EVENT_ORDER as readonly string[]).includes(requested)) return;

    const target = items.find((item) => item.event === requested);
    if (!target) return;
    // Os dois links do Dashboard apontam para eventos GATEADOS (reativação e
    // aniversário). Sem plano, abrir o editor daria um campo que só devolve
    // 403 no salvar — o dono recebe o upsell, que é a informação de que ele
    // precisa.
    if (target.locked) {
      setUpgradeOpen(true);
      return;
    }
    setEditing(target.event);
    // Só na primeira vez que a lista chega: reabrir o modal a cada
    // revalidação seria um pop-up perseguindo o dono.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items !== undefined]);

  const editingAutomation = items?.find((item) => item.event === editing) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <ConnectionCard
        connection={connectionQuery.data}
        isLoading={connectionQuery.isPending}
        isError={connectionQuery.isError}
        onRetry={() => void connectionQuery.refetch()}
      />

      <AutomationsCard
        automations={items}
        isLoading={automationsQuery.isPending}
        isError={automationsQuery.isError}
        onRetry={() => void automationsQuery.refetch()}
        onEdit={setEditing}
        onLockedAttempt={() => setUpgradeOpen(true)}
      />

      <ReactivationBanner
        summary={reactivationQuery.data}
        isLoading={reactivationQuery.isPending}
        isError={reactivationQuery.isError}
        onRetry={() => void reactivationQuery.refetch()}
        onLockedAttempt={() => setUpgradeOpen(true)}
      />

      <HistoryTable
        page={historyQuery.data}
        timezone={shellQuery.data?.tenant.timezone}
        isLoading={historyQuery.isPending}
        isError={historyQuery.isError}
        onRetry={() => void historyQuery.refetch()}
      />

      {automationsQuery.data && (
        <MessageEditorModal
          automation={editingAutomation}
          sample={automationsQuery.data.sample}
          open={editingAutomation !== null}
          onClose={() => setEditing(null)}
        />
      )}

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        minPlanLabel={WHATSAPP_MIN_PLAN_LABEL}
        description={WHATSAPP_UPGRADE_DESCRIPTION}
        benefits={WHATSAPP_UPGRADE_BENEFITS}
      />
    </div>
  );
}

export default function WhatsappPage() {
  return (
    <DashboardChrome activeKey="whatsapp">
      {/* `useSearchParams` obriga a fronteira de Suspense no App Router. */}
      <Suspense fallback={null}>
        <WhatsappScreen />
      </Suspense>
    </DashboardChrome>
  );
}
