'use client';

import { useState } from 'react';
import type { OnboardingService } from '@barbervp/types';
import { Button, IconButton, PlusIcon, Select, centsToInput, inputToCents } from '@barbervp/ui';

export interface StepServicesProps {
  value: OnboardingService[];
  onChange: (next: OnboardingService[]) => void;
}

/** Durações oferecidas no seletor — as mesmas do protótipo. */
const DURATIONS = [15, 30, 45, 50, 60, 75, 90, 120];

const DURATION_OPTIONS = DURATIONS.map((minutes) => ({
  value: String(minutes),
  label: `${minutes} min`,
}));

/**
 * Passo 4 — serviços iniciais.
 *
 * A lista abre pré-populada com sugestões que vêm da API (`SUGGESTED_SERVICES`
 * em `@barbervp/types`), não de um array no cliente — regra 2. Tudo é editável:
 * nome, duração e preço, além de remover e acrescentar.
 *
 * No mobile cada serviço vira um cartão empilhado; a linha única do protótipo
 * só se forma a partir de `sm`.
 */
export function StepServices({ value, onChange }: StepServicesProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', durationMin: 45, price: '' });

  const update = (index: number, partial: Partial<OnboardingService>) => {
    onChange(value.map((service, position) => (position === index ? { ...service, ...partial } : service)));
  };

  const remove = (index: number) => onChange(value.filter((_, position) => position !== index));

  const commitDraft = () => {
    const name = draft.name.trim();
    if (!name) return;
    onChange([
      ...value,
      { name, durationMin: draft.durationMin, priceCents: inputToCents(draft.price) },
    ]);
    setDraft({ name: '', durationMin: 45, price: '' });
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {value.map((service, index) => (
          <li
            key={service.id ?? `novo-${index}`}
            className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center"
          >
            <input
              value={service.name}
              onChange={(event) => update(index, { name: event.target.value })}
              aria-label={`Nome do serviço ${index + 1}`}
              className="h-10 min-w-0 flex-1 rounded-control border border-transparent bg-transparent px-2 font-sans text-sm font-semibold text-fg outline-none transition-colors focus:border-gold focus:bg-surface-2"
            />

            <div className="flex items-center gap-2.5">
              <Select
                value={String(service.durationMin)}
                onChange={(event) => update(index, { durationMin: Number(event.target.value) })}
                options={DURATION_OPTIONS}
                aria-label={`Duração de ${service.name || 'serviço'}`}
                className="w-28 shrink-0 [&_select]:h-10"
              />

              <div className="flex h-10 items-center gap-1 rounded-control border border-border-strong bg-surface-2 px-2.5">
                <span className="text-[13px] font-medium text-fg-subtle">R$</span>
                <input
                  value={centsToInput(service.priceCents)}
                  onChange={(event) =>
                    update(index, { priceCents: inputToCents(event.target.value) })
                  }
                  inputMode="decimal"
                  aria-label={`Preço de ${service.name || 'serviço'}`}
                  className="w-16 bg-transparent text-right font-sans text-sm font-semibold text-fg outline-none"
                />
              </div>

              <IconButton
                variant="outline"
                size="sm"
                onClick={() => remove(index)}
                aria-label={`Remover ${service.name || 'serviço'}`}
                className="rounded-lg"
              >
                ✕
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex animate-bvp-fade flex-col gap-2.5 rounded-xl border border-gold bg-surface p-3 sm:flex-row sm:items-center">
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Nome do serviço"
            aria-label="Nome do novo serviço"
            className="h-10 min-w-0 flex-1 rounded-control border border-border-strong bg-surface-2 px-2.5 font-sans text-sm font-semibold text-fg outline-none focus:border-gold"
          />
          <div className="flex items-center gap-2.5">
            <Select
              value={String(draft.durationMin)}
              onChange={(event) => setDraft({ ...draft, durationMin: Number(event.target.value) })}
              options={DURATION_OPTIONS}
              aria-label="Duração do novo serviço"
              className="w-28 shrink-0 [&_select]:h-10"
            />
            <div className="flex h-10 items-center gap-1 rounded-control border border-border-strong bg-surface-2 px-2.5">
              <span className="text-[13px] font-medium text-fg-subtle">R$</span>
              <input
                value={draft.price}
                onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                placeholder="0"
                inputMode="decimal"
                aria-label="Preço do novo serviço"
                className="w-16 bg-transparent text-right font-sans text-sm font-semibold text-fg outline-none"
              />
            </div>
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
          Adicionar serviço
        </Button>
      )}

      <p className="text-xs text-fg-subtle">
        Você adiciona mais serviços e categorias no painel depois.
      </p>
    </div>
  );
}
