'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SubscriptionStatus, type ClientSubscriptionAccount } from '@barbervp/types';
import { Badge, Button, EmptyState, Skeleton, SkeletonGroup, useClientAuth, useToast, authErrorMessage, type BadgeTone } from '@barbervp/ui';
import { clientAccountApi } from '../../lib/client-account-api';
import { formatPrice } from '../../lib/format';
import { ConfirmDialog } from './confirm-dialog';

const STATUS_APPEARANCE: Record<SubscriptionStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Cobrança em dia', tone: 'success' },
  PAST_DUE: { label: 'Pagamento pendente', tone: 'warning' },
  PAUSED: { label: 'Pausada', tone: 'neutral' },
  CANCELED: { label: 'Cancelada', tone: 'neutral' },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(iso));
}

/** Ilustração simples de "sem assinatura" — o SVG de silhueta do protótipo. */
function NoSubscriptionArt() {
  return (
    <svg width="88" height="88" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="45" r="22" stroke="currentColor" strokeWidth="3" />
      <path d="M30 100c4-20 18-30 30-30s26 10 30 30" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

export function TabAssinatura({
  slug,
  onSubscribe,
}: {
  slug: string;
  onSubscribe: (planId: string) => void;
}) {
  const { api } = useClientAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['minha-conta', 'subscription', slug] });

  const accountQuery = useQuery<ClientSubscriptionAccount>({
    queryKey: ['minha-conta', 'subscription', slug],
    queryFn: () => clientAccountApi.subscription(api, slug),
  });

  const plansQuery = useQuery({
    queryKey: ['minha-conta', 'subscription-plans', slug],
    queryFn: () => clientAccountApi.plans(api, slug),
    // A listagem de planos exige `fidelidadeAssinaturas` no servidor (403 sem
    // isso) — só busca quando o gate já confirmou que a feature existe aqui.
    enabled: Boolean(accountQuery.data?.enabled) && !accountQuery.data?.subscription,
  });

  const pauseMutation = useMutation({
    mutationFn: () => clientAccountApi.pause(api, slug),
    onSuccess: () => {
      toast({ message: 'Assinatura pausada' });
      setShowPauseConfirm(false);
      void invalidate();
    },
    onError: (error) => toast({ message: authErrorMessage(error, 'Não foi possível pausar.'), tone: 'danger' }),
  });

  const resumeMutation = useMutation({
    mutationFn: () => clientAccountApi.resume(api, slug),
    onSuccess: () => {
      toast({ message: 'Assinatura reativada', tone: 'success' });
      void invalidate();
    },
    onError: (error) => toast({ message: authErrorMessage(error, 'Não foi possível reativar.'), tone: 'danger' }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => clientAccountApi.cancel(api, slug),
    onSuccess: () => {
      toast({ message: 'Assinatura cancelada' });
      setShowCancelConfirm(false);
      void invalidate();
    },
    onError: (error) => toast({ message: authErrorMessage(error, 'Não foi possível cancelar.'), tone: 'danger' }),
  });

  if (accountQuery.isPending) {
    return (
      <SkeletonGroup label="Carregando assinatura">
        <Skeleton className="h-40" />
      </SkeletonGroup>
    );
  }

  const subscription = accountQuery.data?.subscription ?? null;

  if (!subscription) {
    const plans = plansQuery.data ?? [];
    if (plans.length === 0 && !plansQuery.isPending) {
      return (
        <EmptyState
          illustration={<NoSubscriptionArt />}
          message="Você ainda não é assinante"
          description="Esta barbearia ainda não cadastrou planos de assinatura."
        />
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          illustration={<NoSubscriptionArt />}
          message="Você ainda não é assinante"
          className="pb-2 pt-6"
        />
        <div className="flex flex-col gap-3">
          {plans.map((plan) => (
            <div key={plan.id} className="flex flex-col gap-2 rounded-xl border border-border p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-base font-bold text-fg">{plan.name}</span>
                {plan.isPopular && <Badge tone="gold">Mais popular</Badge>}
              </div>
              <span className="text-lg font-bold text-gold">
                {formatPrice(plan.priceCents)}
                <span className="text-xs font-normal text-fg-muted"> /mês</span>
              </span>
              <ul className="flex flex-col gap-0.5">
                {plan.items.map((item) => (
                  <li key={item.serviceId} className="text-[13px] text-fg-muted">
                    {item.quota}× {item.serviceName}
                  </li>
                ))}
              </ul>
              {plan.savingsCents > 0 && (
                <span className="text-[13px] font-semibold text-success">
                  Economize {formatPrice(plan.savingsCents)}/mês
                </span>
              )}
              <Button variant="outline" size="sm" className="mt-1" onClick={() => onSubscribe(plan.id)}>
                Assinar
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const appearance = STATUS_APPEARANCE[subscription.status];
  const isPaused = subscription.status === SubscriptionStatus.PAUSED;
  const billingHistory = accountQuery.data?.billingHistory ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl bg-surface-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-base font-bold text-fg">{subscription.planName}</span>
            <span className="text-sm font-semibold text-gold">{formatPrice(subscription.priceCents)}/mês</span>
          </div>
          <Badge tone={appearance.tone}>{appearance.label}</Badge>
        </div>

        <div className="flex flex-col gap-2.5">
          {subscription.usages.map((usage) => {
            const pct = usage.quota > 0 ? Math.round((usage.used / usage.quota) * 100) : 0;
            return (
              <div key={usage.serviceId} className="flex flex-col gap-1">
                <span className="text-[13px] text-fg">
                  {usage.serviceName} — {usage.used}/{usage.quota} usados
                </span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <p className="border-t border-dashed border-border pt-2.5 text-[13px] text-fg-muted">
          {isPaused
            ? 'Cobrança suspensa até você reativar.'
            : `Renova em ${formatDate(subscription.currentPeriodEnd)} · ${formatPrice(subscription.priceCents)}`}
        </p>
      </div>

      {billingHistory.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-display text-[15px] font-bold text-fg">Histórico de cobranças</span>
          {billingHistory.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-fg">{formatDate(entry.createdAt)}</span>
              <span className="text-[13px] text-fg-muted">{formatPrice(entry.amountCents)}</span>
              <span className="text-xs text-success">{entry.status === 'PAID' ? 'Pago' : entry.status}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col items-start gap-3">
        {isPaused ? (
          <Button loading={resumeMutation.isPending} onClick={() => resumeMutation.mutate()}>
            Reativar assinatura
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => setShowPauseConfirm(true)}
            className="text-sm text-fg hover:underline"
          >
            Pausar assinatura
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowCancelConfirm(true)}
          className="text-sm text-danger hover:underline"
        >
          Cancelar assinatura
        </button>
      </div>

      <ConfirmDialog
        open={showPauseConfirm}
        onClose={() => setShowPauseConfirm(false)}
        title="Pausar assinatura?"
        description="Sua cobrança e os usos ficam suspensos até você reativar."
        confirmLabel="Pausar assinatura"
        cancelLabel="Voltar"
        busy={pauseMutation.isPending}
        onConfirm={() => pauseMutation.mutate()}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title="Cancelar assinatura?"
        description="Você perde os usos restantes do ciclo atual e não será mais cobrado."
        confirmLabel="Sim, cancelar"
        cancelLabel="Manter assinatura"
        tone="danger"
        busy={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
      />
    </div>
  );
}
