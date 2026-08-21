'use client';

import type { OnboardingProfile } from '@barbervp/types';
import { Input, Textarea, maskInstagramInput, maskPhoneInput } from '@barbervp/ui';

export interface StepProfileProps {
  value: OnboardingProfile;
  onChange: (next: OnboardingProfile) => void;
}

const DESCRIPTION_MAX = 200;

/** Passo 1 — dados da barbearia (nome, telefone, Instagram, descrição). */
export function StepProfile({ value, onChange }: StepProfileProps) {
  const patch = (partial: Partial<OnboardingProfile>) => onChange({ ...value, ...partial });
  const description = value.description ?? '';

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Nome da barbearia"
        value={value.name}
        onChange={(event) => patch({ name: event.target.value })}
        placeholder="Ex: Barbearia Central"
        required
      />

      <Input
        label="Telefone / WhatsApp"
        type="tel"
        inputMode="numeric"
        value={value.phone ?? ''}
        onChange={(event) => patch({ phone: maskPhoneInput(event.target.value) })}
        placeholder="(00) 00000-0000"
        required
      />

      <Input
        label="Instagram"
        value={value.instagram ?? ''}
        onChange={(event) => patch({ instagram: maskInstagramInput(event.target.value) })}
        placeholder="suabarbearia"
        addonLeft={<span className="text-sm font-semibold">@</span>}
        className="[&_input]:pl-8"
      />

      <Textarea
        label="Descrição curta (opcional)"
        value={description}
        onChange={(event) => patch({ description: event.target.value.slice(0, DESCRIPTION_MAX) })}
        maxLength={DESCRIPTION_MAX}
        rows={4}
        placeholder="Ex: Especialistas em corte degradê e barba. Ambiente climatizado, Wi-Fi e café."
        hint={
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>Essas informações alimentam a seção “Sobre” da sua página pública.</span>
            <span className="tabular-nums" aria-live="polite">
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </span>
        }
      />
    </div>
  );
}
