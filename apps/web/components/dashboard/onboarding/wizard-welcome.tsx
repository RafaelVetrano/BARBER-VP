'use client';

import Link from 'next/link';
import { Button } from '@barbervp/ui';

export interface WizardWelcomeProps {
  ownerFirstName: string;
  onStart: () => void;
}

const BULLETS = [
  'Seus dados de acesso já estão salvos',
  '7 dias grátis, sem cartão de crédito',
  'Você pode editar tudo depois no painel',
] as const;

/** Passo 0 — boas-vindas, com o "B" pulsante do protótipo. */
export function WizardWelcome({ ownerFirstName, onStart }: WizardWelcomeProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mb-7 grid size-[72px] animate-bvp-glow place-items-center rounded-[20px] bg-gradient-to-br from-gold-hover to-gold font-display text-4xl font-bold text-bg"
      >
        B
      </span>

      <h1 className="mb-3 max-w-lg font-display text-[30px] font-bold tracking-tight text-fg">
        Bem-vindo ao BarberVP{ownerFirstName ? `, ${ownerFirstName}` : ''}
      </h1>
      <p className="mb-8 max-w-md text-base leading-relaxed text-fg-muted">
        Vamos configurar sua barbearia em poucos minutos. Você pode pausar a qualquer momento.
      </p>

      <ul className="mb-10 flex max-w-2xl flex-wrap justify-center gap-3.5">
        {BULLETS.map((text) => (
          <li
            key={text}
            className="flex flex-1 basis-44 items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-left"
          >
            <span
              aria-hidden="true"
              className="grid size-5.5 shrink-0 place-items-center rounded-full bg-gold/15 text-xs text-gold"
            >
              ✓
            </span>
            <span className="text-[13px] font-medium leading-snug text-fg-muted">{text}</span>
          </li>
        ))}
      </ul>

      <Button size="lg" onClick={onStart}>
        Começar configuração →
      </Button>

      <Link href="/app" className="mt-4 text-sm font-medium text-fg-subtle hover:text-fg-muted">
        Pular e explorar o painel
      </Link>
    </div>
  );
}
