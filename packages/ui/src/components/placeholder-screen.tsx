import type { ReactNode } from 'react';
import { ScissorsIcon } from '../icons';
import { cn } from '../lib/cn';

export interface PlaceholderScreenProps {
  /** Nome da app — ex.: "apps/dashboard". */
  appName: string;
  title: string;
  description: string;
  /** Fase do kit que constrói as telas de verdade desta app. */
  nextPhase: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Placeholder da fase 01 — cada app renderiza esta tela no tema de produto
 * enquanto suas telas reais não chegam. Layout fluido de 360px a 1920px.
 */
export function PlaceholderScreen({
  appName,
  title,
  description,
  nextPhase,
  children,
  className,
}: PlaceholderScreenProps) {
  return (
    <main
      className={cn(
        'flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12 sm:px-6 lg:px-8',
        className,
      )}
    >
      <div className="w-full max-w-xl animate-bvp-rise">
        <div className="rounded-3xl border border-border bg-surface-2 p-6 shadow-card sm:p-8 lg:p-10">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-gold/30 bg-gold/10 text-gold animate-bvp-glow">
              <ScissorsIcon size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold tracking-tight text-fg">BarberVP</p>
              <p className="truncate font-mono text-xs text-fg-subtle">{appName}</p>
            </div>
          </div>

          <h1 className="mt-6 font-display text-2xl font-bold leading-tight text-fg sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-fg-muted sm:text-base">
            {description}
          </p>

          <div className="mt-6 space-y-4">{children}</div>

          <p className="mt-6 border-t border-border pt-4 text-xs text-fg-subtle">
            Fase 01 (Fundação) concluída. Telas reais desta app: <b>{nextPhase}</b>.
          </p>
        </div>
      </div>
    </main>
  );
}
