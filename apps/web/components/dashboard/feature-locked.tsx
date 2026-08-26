'use client';

import { useRouter } from 'next/navigation';
import { Button, LockIcon } from '@barbervp/ui';

export interface FeatureLockedProps {
  title: string;
  description: string;
  benefits: string[];
  /** Plano mínimo, só para o texto ("Disponível no plano X"). */
  minPlanLabel: string;
}

/**
 * Upsell de um recurso fora do plano — o bloco `isFinTabLockedContent` do
 * protótipo (`Dashboard.dc.html` l.815), reaproveitado por toda aba trancada.
 *
 * Os benefícios ficam VISÍVEIS no bloco, não escondidos atrás de um modal: o
 * dono precisa saber o que está comprando antes de decidir clicar. Os dois
 * botões são os do protótipo — "Ver planos" leva à lista, "Fazer upgrade" leva
 * à aba de plano e cobrança.
 *
 * NUNCA some o botão sem explicação (regra 3 do enunciado): quem decide o 403
 * é o servidor, aqui só se antecipa o motivo.
 */
export function FeatureLocked({ title, description, benefits, minPlanLabel }: FeatureLockedProps) {
  const router = useRouter();

  return (
    <div className="flex justify-center py-10 md:py-14">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-7 text-center">
        <span className="flex size-[52px] items-center justify-center rounded-full bg-gold/15">
          <LockIcon size={24} className="text-gold" />
        </span>

        <h2 className="font-display text-[17px] font-bold text-fg">{title}</h2>
        <p className="text-[13px] text-fg-muted">{description}</p>

        <ul className="flex w-full flex-col items-start gap-2">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-left text-[13px] text-fg">
              <span aria-hidden="true" className="text-success">
                ✓
              </span>
              {benefit}
            </li>
          ))}
        </ul>

        <div className="mt-1 flex w-full flex-col gap-2.5 sm:flex-row">
          {/* A comparação dos planos mora na landing (`#bvp-plans`) — é a
              única tela do produto que lista os três lado a lado. */}
          <Button variant="outline" fullWidth onClick={() => router.push('/#bvp-plans')}>
            Ver planos
          </Button>
          <Button fullWidth onClick={() => router.push('/app/configuracoes?tab=plano')}>
            Fazer upgrade
          </Button>
        </div>

        <p className="text-xs text-fg-muted">Disponível a partir do plano {minPlanLabel}.</p>
      </div>
    </div>
  );
}
