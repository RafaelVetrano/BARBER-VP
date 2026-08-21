'use client';

import { useRouter } from 'next/navigation';
import { Button, Skeleton } from '@barbervp/ui';
import { formatBRL, type DashboardShellResponse } from '@barbervp/types';

export interface PlanFooterProps {
  shell: DashboardShellResponse | undefined;
  loading: boolean;
}

/**
 * Rodapé da sidebar (`Dashboard.dc.html`, linhas 72–84): card com o plano
 * ativo, o preço e o CTA — "Fazer upgrade", ou "Plano máximo ativo ✓" quando
 * já se está no topo.
 *
 * O protótipo trata teste e plano como blocos alternativos; aqui os dois
 * convivem, porque o tenant em `TRIAL` de fato ainda não contratou plano
 * nenhum e precisa ver quantos dias lhe restam.
 */
export function PlanFooter({ shell, loading }: PlanFooterProps) {
  const router = useRouter();

  if (loading) {
    return <Skeleton className="h-[92px] rounded-xl" />;
  }

  if (!shell) {
    return null;
  }

  const { plan, trial } = shell;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface-3 p-3.5">
      {trial && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-fg">
            {trial.daysLeft === 0
              ? 'Seu teste terminou'
              : `${trial.daysLeft} ${trial.daysLeft === 1 ? 'dia' : 'dias'} de teste restantes`}
          </p>
          <div
            role="progressbar"
            aria-valuenow={trial.progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Período de teste consumido"
            className="h-1.5 overflow-hidden rounded-full bg-border"
          >
            <span className="block h-full rounded-full bg-gold" style={{ width: `${trial.progressPct}%` }} />
          </div>
        </div>
      )}

      {plan ? (
        <div>
          <p className="text-[13px] font-semibold text-fg">Plano {plan.name}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{formatBRL(plan.priceCents)}/mês</p>
        </div>
      ) : (
        <p className="text-xs text-fg-muted">Nenhum plano contratado ainda.</p>
      )}

      {plan?.isMaxTier ? (
        <p className="rounded-lg border border-border px-3 py-2 text-center text-[13px] font-semibold text-fg-muted">
          Plano máximo ativo ✓
        </p>
      ) : (
        <Button size="sm" fullWidth onClick={() => router.push('/app/configuracoes?tab=plano')}>
          {plan ? 'Fazer upgrade' : 'Escolher plano'}
        </Button>
      )}
    </div>
  );
}
