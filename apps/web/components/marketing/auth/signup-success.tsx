'use client';

import { Button } from '@barbervp/ui';

export interface SignupSuccessProps {
  shopName: string;
  onContinue: () => void;
}

/**
 * "Barbearia vinculada à sua conta!" — a tela de confirmação do fluxo de
 * vínculo, com o círculo dourado e o check desenhado do protótipo.
 */
export function SignupSuccess({ shopName, onContinue }: SignupSuccessProps) {
  return (
    <div className="flex animate-bvp-rise flex-col items-center pt-6 text-center sm:pt-10">
      <div className="mb-6 grid size-[76px] place-items-center rounded-full bg-gold/[0.12]">
        <svg width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle
            cx="20"
            cy="20"
            r="19"
            stroke="currentColor"
            strokeWidth="2"
            className="animate-bvp-ring text-gold [stroke-dasharray:120]"
          />
          <path
            d="M12 20.5l5.2 5.2L28.5 14.5"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-bvp-check text-gold [stroke-dasharray:48]"
          />
        </svg>
      </div>

      <h2 className="mb-3 font-display text-[27px] font-bold tracking-tight text-fg">
        Barbearia vinculada à sua conta!
      </h2>
      <p className="mb-7 max-w-sm text-[15px] leading-relaxed text-fg-muted">
        Agora você tem dois perfis na mesma conta: cliente e dono. Vamos configurar a{' '}
        <strong className="font-semibold text-fg">{shopName}</strong>.
      </p>

      <Button onClick={onContinue} size="lg" fullWidth>
        Configurar minha barbearia →
      </Button>

      <p className="mt-4 text-xs font-medium text-fg-subtle">
        Você poderá alternar entre os perfis a qualquer momento.
      </p>
    </div>
  );
}
