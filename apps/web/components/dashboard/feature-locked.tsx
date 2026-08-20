'use client';

import { useState } from 'react';
import { Button, LockIcon } from '@barbervp/ui';
import { UpgradeModal } from './upgrade-modal';

export interface FeatureLockedProps {
  title: string;
  description: string;
  benefits: string[];
  /** Plano mínimo, só para o texto ("Disponível no plano X"). */
  minPlanLabel: string;
}

/**
 * Upsell discreto quando um recurso está fora do plano — NUNCA some o botão
 * sem explicação (enunciado da fase 07): mostra o motivo na hora e um CTA
 * claro para o upgrade, no padrão `openUpgradeModal` do protótipo.
 */
export function FeatureLocked({ title, description, benefits, minPlanLabel }: FeatureLockedProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-2 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15">
        <LockIcon size={22} className="text-gold" />
      </div>
      <p className="font-display text-base font-bold text-fg">{title}</p>
      <p className="max-w-sm text-sm text-fg-muted">{description}</p>
      <Button size="sm" onClick={() => setOpen(true)}>
        Ver benefícios do plano {minPlanLabel}
      </Button>

      <UpgradeModal open={open} onClose={() => setOpen(false)} minPlanLabel={minPlanLabel} description={description} benefits={benefits} />
    </div>
  );
}
