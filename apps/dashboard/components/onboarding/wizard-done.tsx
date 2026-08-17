'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, buttonClasses, useToast } from '@barbervp/ui';

export interface WizardDoneProps {
  ownerFirstName: string;
  publicUrl: string;
  barbersCount: number;
}

/** Tela de conclusão: anel + check desenhados, link copiável e próximos passos. */
export function WizardDone({ ownerFirstName, publicUrl, barbersCount }: WizardDoneProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Sem permissão de área de transferência (ou contexto inseguro): o link
      // está visível na tela e pode ser copiado à mão.
      toast({ message: 'Copie o link manualmente: ele está logo acima.' });
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <svg width="84" height="84" viewBox="0 0 84 84" className="mb-6" aria-hidden="true">
        <circle
          cx="42"
          cy="42"
          r="32"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          transform="rotate(-90 42 42)"
          className="animate-bvp-ring text-gold [stroke-dasharray:201]"
        />
        <path
          d="M28 43 L38 53 L57 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-bvp-check text-gold [stroke-dasharray:48]"
        />
      </svg>

      <h1 className="mb-3 font-display text-[32px] font-bold tracking-tight text-fg">
        Tudo pronto{ownerFirstName ? `, ${ownerFirstName}` : ''}!
      </h1>
      <p className="mb-6 max-w-md text-[15px] leading-relaxed text-fg-muted">
        Sua barbearia está configurada. Agora é hora de ver o painel e receber seus primeiros
        agendamentos.
      </p>

      <div className="mb-7 flex w-full max-w-md flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3.5">
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-fg-muted">
          {publicUrl}
        </span>
        <Button variant="outline" size="sm" onClick={() => void copyLink()}>
          {copied ? 'Copiado ✓' : 'Copiar link'}
        </Button>
      </div>

      <div className="mb-8 flex w-full max-w-xl flex-wrap justify-center gap-3.5">
        <Link
          href="/"
          className="flex flex-1 basis-56 items-center gap-3.5 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-gold"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-lg"
          >
            🔗
          </span>
          <span className="text-sm font-semibold leading-snug text-fg">
            Compartilhe seu link de agendamento com clientes
          </span>
        </Link>

        <Link
          href="/agenda"
          className="flex flex-1 basis-56 flex-col gap-1 rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-gold"
        >
          <span className="flex items-center gap-3.5">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-lg"
            >
              {barbersCount <= 1 ? '👤' : '📅'}
            </span>
            <span className="text-sm font-semibold leading-snug text-fg">
              {barbersCount <= 1 ? 'Adicione os barbeiros da sua equipe' : 'Confira sua agenda'}
            </span>
          </span>
          {barbersCount <= 1 && (
            <span className="pl-[3.375rem] text-[11.5px] leading-snug text-fg-subtle">
              A quantidade de profissionais define sua faixa de plano.
            </span>
          )}
        </Link>
      </div>

      <Link href="/" className={buttonClasses({ size: 'lg' })}>
        Ir para o dashboard →
      </Link>
    </div>
  );
}
