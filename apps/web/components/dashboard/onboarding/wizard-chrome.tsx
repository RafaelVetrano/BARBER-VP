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
  /**
   * O que se perde ao pular — dito ANTES do clique, não depois. "Pular etapa"
   * sem custo visível parece a escolha barata; com o custo à vista, o dono
   * decide sabendo o que está adiando.
   */
  skipHint?: string;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  saving?: boolean;
}

/**
 * Moldura do wizard: cabeçalho fixo com progresso e rodapé fixo de navegação —
 * a estrutura do `BarberVP Configurar Barbearia.dc.html`.
 *
 * **Sem o "×" (continuar depois)** desde o agente 30: concluir a configuração
 * inicial é obrigatório, então não existe saída lateral — e nenhum atalho a
 * substituiu. Quem já concluiu não volta para cá (o guard manda para o painel),
 * que é o caso que o "×" fingia atender.
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
  skipHint,
  onNext,
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
          {/* Contrapeso do bloco da marca à esquerda: sem o "×" que ficava
              aqui, o título centrado no espaço restante sairia do eixo da
              barra de progresso logo abaixo. Larguras espelham logo (28px) +
              `gap-3` e, a partir de `sm`, o "BarberVP". */}
          <span aria-hidden="true" className="w-7 shrink-0 sm:w-[5.5rem]" />
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
        {onSkip && skipHint && (
          <p className="mx-auto w-full max-w-3xl px-4 pt-2.5 text-right text-[11.5px] text-fg-subtle sm:px-6">
            {skipHint}
          </p>
        )}
        {/* Abaixo de `sm` o botão principal OCUPA a sobra em vez de ser
            empurrado por um espaçador: com "Voltar" + "Abrir meu painel →" a
            largura natural dos dois estourava 360px em 21px, e o rodapé fixo
            empurrava a página inteira para o lado. Do `sm` para cima volta o
            arranjo do protótipo — Voltar à esquerda, o resto à direita. */}
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3.5 sm:gap-3 sm:px-6">
          {onBack && (
            <Button variant="outline" onClick={onBack} disabled={saving} className="shrink-0">
              Voltar
            </Button>
          )}
          <span className="hidden flex-1 sm:block" />
          {onSkip && (
            <Button variant="ghost" onClick={onSkip} disabled={saving} className="shrink-0">
              Pular etapa
            </Button>
          )}
          <Button
            onClick={onNext}
            disabled={nextDisabled}
            loading={saving}
            loadingText="Salvando…"
            className="min-w-0 flex-1 sm:flex-none"
          >
            {nextLabel}
          </Button>
        </div>
      </footer>
    </div>
  );
}
