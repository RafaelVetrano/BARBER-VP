'use client';

import { useState } from 'react';
import type { OnboardingBarber } from '@barbervp/types';
import { Avatar, Badge, Button, IconButton, PlusIcon, maskPhoneInput } from '@barbervp/ui';

export interface StepTeamProps {
  /** Inclui o dono, que vem marcado com `isOwner` e não pode ser removido. */
  value: OnboardingBarber[];
  onChange: (next: OnboardingBarber[]) => void;
}

/**
 * Passo 5 — equipe (pulável).
 *
 * O dono já entra como profissional: o `Barber` dele nasce junto com o tenant,
 * no registro, e aparece aqui como linha fixa com a pílula "Você". Só os
 * demais barbeiros são editáveis.
 */
export function StepTeam({ value, onChange }: StepTeamProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '' });

  const owner = value.find((barber) => barber.isOwner);
  const team = value.filter((barber) => !barber.isOwner);

  const replaceTeam = (next: OnboardingBarber[]) =>
    onChange(owner ? [owner, ...next] : next);

  const commitDraft = () => {
    const name = draft.name.trim();
    if (!name) return;
    replaceTeam([...team, { name, phone: draft.phone || null }]);
    setDraft({ name: '', phone: '' });
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {owner && (
          <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
            <Avatar name={owner.name} className="bg-gold/15 text-gold" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
              {owner.name}
            </span>
            <Badge tone="gold">Você</Badge>
          </li>
        )}

        {team.map((barber, index) => (
          <li
            key={barber.id ?? `novo-${index}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
          >
            <Avatar name={barber.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{barber.name}</span>
              {barber.phone && (
                <span className="block truncate text-xs text-fg-subtle">{barber.phone}</span>
              )}
            </span>
            <IconButton
              variant="outline"
              size="sm"
              onClick={() => replaceTeam(team.filter((_, position) => position !== index))}
              aria-label={`Remover ${barber.name}`}
              className="rounded-lg"
            >
              ✕
            </IconButton>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex animate-bvp-fade flex-col gap-2.5 rounded-xl border border-gold bg-surface p-3 sm:flex-row sm:items-center">
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Nome do barbeiro"
            aria-label="Nome do novo barbeiro"
            className="h-10 min-w-0 flex-1 rounded-control border border-border-strong bg-surface-2 px-2.5 font-sans text-sm font-semibold text-fg outline-none focus:border-gold"
          />
          <input
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: maskPhoneInput(event.target.value) })}
            placeholder="(11) 98765-4321"
            inputMode="numeric"
            aria-label="WhatsApp do novo barbeiro"
            className="h-10 min-w-0 flex-1 rounded-control border border-border-strong bg-surface-2 px-2.5 font-sans text-sm font-semibold text-fg outline-none focus:border-gold"
          />
          <div className="flex items-center gap-2.5">
            <Button size="sm" onClick={commitDraft} disabled={!draft.name.trim()}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => setAdding(true)}
          iconLeft={<PlusIcon size={16} />}
          className="self-start border-dashed"
        >
          Adicionar barbeiro
        </Button>
      )}

      <p className="text-xs leading-relaxed text-fg-subtle">
        A quantidade de profissionais define sua faixa de plano — Essencial até 2 · Profissional até
        4 · Avançado ilimitado. Durante o trial tudo é permitido; apenas informativo.
      </p>
    </div>
  );
}
