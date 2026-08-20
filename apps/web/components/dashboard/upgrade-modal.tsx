'use client';

import { useRouter } from 'next/navigation';
import { Button, CheckIcon, Modal } from '@barbervp/ui';

export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  minPlanLabel: string;
  description: string;
  benefits: string[];
}

/** Modal de upsell isolado — usado tanto pelo `FeatureLocked` (seções inteiras) quanto por controles pontuais (ex.: um `Switch` que tentou ligar algo fora do plano). */
export function UpgradeModal({ open, onClose, minPlanLabel, description, benefits }: UpgradeModalProps) {
  const router = useRouter();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Disponível no plano ${minPlanLabel}`}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" fullWidth onClick={onClose}>
            Agora não
          </Button>
          <Button fullWidth onClick={() => router.push('/app/configuracoes?tab=plano')}>
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
  );
}
