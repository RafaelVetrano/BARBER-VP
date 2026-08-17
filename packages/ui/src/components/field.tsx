'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface FieldOwnProps {
  /** Rótulo acima do campo. Sem ele, passe `aria-label` no controle. */
  label?: ReactNode;
  /** Marca o rótulo com `*` (como todos os formulários do protótipo). */
  required?: boolean;
  /** Texto auxiliar exibido quando não há erro. */
  hint?: ReactNode;
  /** Mensagem de erro — deixa a borda vermelha e vira `aria-describedby`. */
  error?: ReactNode;
  /** Estado de sucesso: check verde à direita (padrão dos formulários de auth). */
  success?: boolean;
  className?: string;
}

/** Ids ligados entre rótulo, controle, dica e erro. */
export function useFieldIds(providedId?: string) {
  const auto = useId();
  const id = providedId ?? `bvp-${auto}`;
  return { id, hintId: `${id}-hint`, errorId: `${id}-error` };
}

/**
 * Estilo base compartilhado por `Input`, `Textarea` e `Select`.
 *
 * Portado de `inputBase` (`AgendamentoWizard.dc.html` / `ClienteAuth.dc.html`):
 * 48px de altura, raio 10px, fundo de superfície, borda `--line` e borda
 * vermelha no erro.
 */
export function controlClasses(opts: { error?: boolean; success?: boolean; className?: string }) {
  return cn(
    'w-full rounded-control border bg-surface-2 px-3 font-sans text-sm text-fg',
    'placeholder:text-fg-subtle',
    'transition-colors duration-150',
    'focus:outline-none focus-visible:outline-none focus:border-gold focus:ring-2 focus:ring-gold/30',
    'disabled:cursor-not-allowed disabled:opacity-50',
    opts.error ? 'border-danger' : opts.success ? 'border-success' : 'border-border',
    opts.className,
  );
}

export interface FieldProps extends FieldOwnProps {
  /** Ids gerados por `useFieldIds`. */
  ids: ReturnType<typeof useFieldIds>;
  children: ReactNode;
}

/** Moldura rótulo + controle + mensagem, comum a todos os campos. */
export function Field({ label, required, hint, error, ids, className, children }: FieldProps) {
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={ids.id} className="text-[13px] text-fg-muted">
          {label}
          {required && <span className="ml-0.5 text-gold">*</span>}
        </label>
      )}

      {children}

      {error ? (
        <span id={ids.errorId} role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : hint ? (
        <span id={ids.hintId} className="text-xs text-fg-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** `aria-describedby` correto conforme haja erro, dica ou nada. */
export function describedBy(ids: ReturnType<typeof useFieldIds>, error?: unknown, hint?: unknown) {
  if (error) return ids.errorId;
  if (hint) return ids.hintId;
  return undefined;
}
