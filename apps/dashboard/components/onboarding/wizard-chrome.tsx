'use client';

import type { ReactNode } from 'react';
import { Button, cn } from '@barbervp/ui';

export interface WizardChromeProps {
  /** Passo corrente, 1..6. */
  step: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
  onNext: () => void;
  onExit: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  saving?: boolean;
}

/**
 * Moldura do wizard: cabeçalho fixo com progresso e rodapé fixo de navegação —
 * a estrutura do `BarberVP Configurar Barbearia.dc.html`.
 *
 * Responsividade (regra 1): o protótipo é desktop-fixo com `max-width:720px`.
 * Aqui o miolo respira de 360px para cima, o rodapé fixo respeita a área segura
 * do iOS (`env(safe-area-inset-bottom)`) e o conteúdo reserva o espaço dele com
 * `padding-bottom`, para o último campo nunca ficar debaixo dos botões.
 */
export function WizardChrome({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  onBack,
  onSkip,
  onNext,
  onExit,
  nextLabel,
  nextDisabled = false,
  saving = false,
}: WizardChromeProps) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3.5 sm:px-6">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-gold-hover to-gold font-display text-sm font-bold text-bg"
          >
            B
          </span>
          <span className="hidden font-display text-sm font-bold text-fg-subtle sm:inline">
            BarberVP
          </span>
          <span className="flex-1 text-center font-display text-sm font-bold text-fg">
            <span className="hidden sm:inline">Configurar barbearia · </span>
            {step} de {totalSteps}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onExit}
            title="Continuar depois — seu progresso é salvo"
            className="size-9 shrink-0 rounded-lg p-0"
            aria-label="Continuar depois"
          >
            ✕
          </Button>
        </div>

        <div
          className="mx-auto flex w-full max-w-3xl gap-1.5 px-4 pb-4 sm:px-6"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label={`Etapa ${step} de ${totalSteps}`}
        >
          {Array.from({ length: totalSteps }, (_, index) => (
            <span
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                step >= index + 1 ? 'bg-gold' : 'bg-surface-3',
              )}
            />
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-40 pt-8 sm:px-6">
        <h1 className="mb-1.5 font-display text-2xl font-bold tracking-tight text-fg">{title}</h1>
        <p className="mb-6 text-sm text-fg-muted">{subtitle}</p>
        {children}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-border bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3.5 sm:px-6">
          {onBack && (
            <Button variant="outline" onClick={onBack} disabled={saving}>
              Voltar
            </Button>
          )}
          <span className="flex-1" />
          {onSkip && (
            <Button variant="ghost" onClick={onSkip} disabled={saving}>
              Pular etapa
            </Button>
          )}
          <Button onClick={onNext} disabled={nextDisabled} loading={saving} loadingText="Salvando…">
            {nextLabel}
          </Button>
        </div>
      </footer>
    </div>
  );
}
