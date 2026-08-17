'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, CheckIcon, LockIcon, Modal } from '@barbervp/ui';

export interface FeatureLockedProps {
  title: string;
  description: string;
  benefits: string[];
  /** Plano mínimo, só para o texto ("Disponível no plano X"). */
  minPlanLabel: string;
}

/**
 * Upsell discreto quando um recurso está fora do plano — NUNCA some o botão
 * sem explicação (`SPEC.md`/enunciado da fase 07): mostra o motivo na hora
 * e um CTA claro para o upgrade, no padrão `openUpgradeModal` do protótipo.
 */
export function FeatureLocked({ title, description, benefits, minPlanLabel }: FeatureLockedProps) {
  const router = useRouter();
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Disponível no plano ${minPlanLabel}`}
        footer={
          <div className="flex w-full gap-2">
            <Button variant="outline" fullWidth onClick={() => setOpen(false)}>
              Agora não
            </Button>
            <Button fullWidth onClick={() => router.push('/configuracoes?tab=plano')}>
              Fazer upgrade
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">{description}</p>
          <ul className="flex flex-col gap-2">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-sm text-fg">
                <CheckIcon size={16} className="mt-0.5 shrink-0 text-success" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
