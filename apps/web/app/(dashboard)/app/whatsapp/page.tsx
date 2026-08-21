'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, LockIcon, Skeleton, Switch, useToast } from '@barbervp/ui';
import type { WhatsappAutomationItem, WhatsappEvent } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { UpgradeModal } from '@/components/dashboard/upgrade-modal';
import { useUpdateWhatsappAutomationMutation, useWhatsappAutomationsQuery } from '@/lib/dashboard/api/whatsapp';

const EVENT_LABELS: Record<WhatsappEvent, string> = {
  REMINDER: 'Lembrete',
  CONFIRMATION: 'Confirmação',
  CANCELLATION: 'Cancelamento',
  BIRTHDAY: 'Aniversário',
  REACTIVATION: 'Reativação',
  REVIEW: 'Avaliação',
};

const EVENT_DESCRIPTIONS: Record<WhatsappEvent, string> = {
  REMINDER: 'Enviado antes do horário — configure a antecedência.',
  CONFIRMATION: 'Enviado assim que o agendamento é confirmado.',
  CANCELLATION: 'Enviado quando o agendamento é cancelado.',
  BIRTHDAY: 'Enviado no aniversário do cliente.',
  REACTIVATION: 'Enviado para clientes que sumiram.',
  REVIEW: 'Pede avaliação depois do atendimento.',
};

function AutomationCard({ automation }: { automation: WhatsappAutomationItem }) {
  const { toast } = useToast();
  const update = useUpdateWhatsappAutomationMutation();
  const [template, setTemplate] = useState(automation.template);
  const [offset, setOffset] = useState(String(automation.offsetMinutes ?? ''));
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const toggle = async (checked: boolean) => {
    try {
      await update.mutateAsync({ event: automation.event, dto: { enabled: checked } });
    } catch {
      setUpgradeOpen(true);
    }
  };

  const saveTemplate = async () => {
    try {
      await update.mutateAsync({
        event: automation.event,
        dto: { template, offsetMinutes: automation.event === 'REMINDER' ? Number(offset) || null : undefined },
      });
      toast({ message: 'Template salvo.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardHeader title={EVENT_LABELS[automation.event]} description={EVENT_DESCRIPTIONS[automation.event]} />
        <div className="flex items-center gap-2">
          {automation.requiresFullFeature && <LockIcon size={16} className="text-fg-muted" />}
          <Switch checked={automation.enabled} onChange={(e) => void toggle(e.target.checked)} />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {automation.event === 'REMINDER' && (
          <input
            className="h-9 w-40 rounded-control border border-border bg-surface-2 px-3 text-sm text-fg outline-none"
            placeholder="Minutos de antecedência"
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
          />
        )}
        <textarea
          className="min-h-24 w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
        <p className="text-xs text-fg-muted">
          Variáveis: {'{nome} {data} {horario} {servico} {barbeiro} {link_agendamento}'}
        </p>
        <Button size="sm" variant="outline" className="self-start" onClick={() => void saveTemplate()}>
          Salvar template
        </Button>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        minPlanLabel="Profissional"
        description="Automações além de lembrete/confirmação/cancelamento (aniversário, reativação, avaliação) fazem parte do WhatsApp completo."
        benefits={['Aniversário automático com desconto', 'Reativação de clientes inativos', 'Pedido de avaliação pós-atendimento']}
      />
    </Card>
  );
}

export default function WhatsappPage() {
  const automationsQuery = useWhatsappAutomationsQuery();

  return (
    <DashboardChrome activeKey="whatsapp">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">WhatsApp</h1>
        {automationsQuery.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(automationsQuery.data ?? []).map((automation) => (
              <AutomationCard key={automation.event} automation={automation} />
            ))}
          </div>
        )}
      </div>
    </DashboardChrome>
  );
}
