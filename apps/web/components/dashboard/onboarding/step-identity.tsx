'use client';

import { useEffect, useState } from 'react';
import { slugify, type OnboardingIdentity } from '@barbervp/types';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  Input,
  onboardingApi,
  useEstablishmentAuth,
} from '@barbervp/ui';

export interface StepIdentityProps {
  value: OnboardingIdentity;
  publicUrlBase: string;
  onChange: (next: OnboardingIdentity) => void;
  onAvailabilityChange: (available: boolean) => void;
}

const SLUG_CHECK_DEBOUNCE_MS = 400;

/**
 * Passo 3 — identidade e link público (pulável).
 *
 * Upload de logo e capa ficam para a fase 09, quando existir storage de
 * arquivo: aqui o campo aceita URL, que é o que o schema guarda
 * (`TenantSettings.logoUrl`/`coverUrl`). O slug é conferido contra a API
 * enquanto se digita — a mesma `slugify` dos dois lados.
 */
export function StepIdentity({
  value,
  publicUrlBase,
  onChange,
  onAvailabilityChange,
}: StepIdentityProps) {
  const { client } = useEstablishmentAuth();
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const patch = (partial: Partial<OnboardingIdentity>) => onChange({ ...value, ...partial });

  useEffect(() => {
    const slug = value.slug.trim();
    if (slug.length < 3) {
      setAvailable(false);
      onAvailabilityChange(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      void onboardingApi
        .checkSlug(client, slug)
        .then((result) => {
          if (cancelled) return;
          setAvailable(result.available);
          setSuggestion(result.suggestion ?? null);
          onAvailabilityChange(result.available);
        })
        .catch(() => {
          // Rede fora não pode travar o passo: o servidor valida no submit.
          if (!cancelled) {
            setAvailable(null);
            onAvailabilityChange(true);
          }
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, SLUG_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setChecking(false);
    };
  }, [value.slug, client, onAvailabilityChange]);

  return (
    <div className="flex flex-col gap-5">
      <Input
        label="URL do logo"
        type="url"
        value={value.logoUrl ?? ''}
        onChange={(event) => patch({ logoUrl: event.target.value || null })}
        placeholder="https://…/logo.png"
        hint="Quadrado, mínimo 400×400px. O upload direto chega na fase de integrações."
      />

      <Input
        label="URL da foto de capa"
        type="url"
        value={value.coverUrl ?? ''}
        onChange={(event) => patch({ coverUrl: event.target.value || null })}
        placeholder="https://…/capa.jpg"
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bvp-slug" className="text-[13px] text-fg-muted">
          URL personalizada
        </label>
        <div className="flex flex-col sm:flex-row">
          <span className="flex items-center rounded-t-control border border-border-strong bg-surface-3 px-3 py-2.5 text-sm text-fg-subtle sm:rounded-l-control sm:rounded-tr-none sm:border-r-0 sm:py-0">
            {publicUrlBase}/agendar/
          </span>
          <input
            id="bvp-slug"
            value={value.slug}
            onChange={(event) => patch({ slug: slugify(event.target.value) })}
            className="h-12 min-w-0 flex-1 rounded-b-control border border-border-strong bg-surface-2 px-3.5 font-sans text-sm text-fg outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/30 sm:rounded-l-none sm:rounded-r-control"
            aria-describedby="bvp-slug-status"
          />
        </div>

        <p id="bvp-slug-status" className="min-h-4 text-xs" aria-live="polite">
          {checking ? (
            <span className="text-fg-subtle">Verificando disponibilidade…</span>
          ) : available === true ? (
            <span className="flex items-center gap-1.5 text-success">
              <CheckCircleIcon size={14} /> Link disponível
            </span>
          ) : available === false ? (
            <span className="flex items-center gap-1.5 text-danger">
              <AlertCircleIcon size={14} />
              {value.slug.trim().length < 3
                ? 'Use ao menos 3 caracteres.'
                : `Este link já está em uso${suggestion ? ` — que tal ${suggestion}?` : '.'}`}
            </span>
          ) : (
            <span className="text-fg-subtle">
              Este é o link que seus clientes usarão para agendar.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
