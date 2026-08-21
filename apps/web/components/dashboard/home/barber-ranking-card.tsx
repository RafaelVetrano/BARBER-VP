'use client';

import { Card, EmptyState } from '@barbervp/ui';
import { formatBRL, type DashboardBarberRankItem, type DashboardScope } from '@barbervp/types';

/**
 * Card "Ranking de barbeiros (semana)" (`Dashboard.dc.html`, linhas 288–306):
 * avatar de 34px com as iniciais em dourado, nome, "N atend. · R$ valor" e a
 * barra proporcional ao líder.
 *
 * Para o papel `BARBER` a API devolve só a própria linha — daí o título mudar:
 * chamar de "ranking" uma lista de um nome só seria mentira.
 */
export function BarberRankingCard({
  ranking,
  scope,
}: {
  ranking: DashboardBarberRankItem[];
  scope: DashboardScope;
}) {
  const leader = Math.max(...ranking.map((item) => item.count), 1);

  return (
    <Card className="gap-3.5 p-5">
      <h2 className="font-display text-base font-bold text-fg">
        {scope === 'BARBER' ? 'Seus atendimentos (semana)' : 'Ranking de barbeiros (semana)'}
      </h2>

      {ranking.length === 0 ? (
        <EmptyState className="py-10" message="Nenhum atendimento esta semana" />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {ranking.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-[34px] shrink-0 place-items-center rounded-full border border-border bg-surface-3 text-xs font-semibold text-gold"
              >
                {item.initials}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-fg">{item.name}</span>
                  <span className="shrink-0 text-[13px] font-medium text-fg-muted">
                    {item.count} atend. · {formatBRL(item.revenueCents)}
                  </span>
                </div>
                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-[4px] bg-border">
                  <span
                    className="block h-full rounded-[4px] bg-gold"
                    style={{ width: `${(item.count / leader) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
