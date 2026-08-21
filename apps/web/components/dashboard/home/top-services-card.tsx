'use client';

import { Card, Donut, EmptyState, donutColor } from '@barbervp/ui';
import { formatBRL, type DashboardTopService } from '@barbervp/types';

/**
 * Card "Serviços mais vendidos (mês)" (`Dashboard.dc.html`, linhas 268–288):
 * rosca de 150px com o total no miolo e legenda com bolinha, nome e
 * "% · R$ valor".
 *
 * A fatia "Outros" é agregada no servidor e sempre recebe a última cor da
 * paleta — é o que a torna reconhecível como resto, e não como mais um serviço.
 */
export function TopServicesCard({ services }: { services: DashboardTopService[] }) {
  const total = services.reduce((sum, service) => sum + service.revenueCents, 0);

  const colored = services.map((service, index) => ({
    ...service,
    color: donutColor(index, service.serviceId === null),
  }));

  return (
    <Card className="gap-4 p-5">
      <h2 className="font-display text-base font-bold text-fg">Serviços mais vendidos (mês)</h2>

      {services.length === 0 ? (
        <EmptyState
          className="py-10"
          message="Nenhum serviço vendido neste mês"
          description="A divisão aparece assim que a primeira comanda for fechada."
        />
      ) : (
        <>
          <div className="flex justify-center py-2">
            <Donut
              size={150}
              thickness={27}
              slices={colored.map((service) => ({
                pct: service.pct,
                color: service.color,
                label: service.name,
              }))}
              label={`Faturamento por serviço no mês: ${colored
                .map((service) => `${service.name} ${service.pct}%`)
                .join(', ')}`}
            >
              <span className="font-display text-base font-bold text-fg">{formatBRL(total)}</span>
              <span className="text-[11px] text-fg-muted">no mês</span>
            </Donut>
          </div>

          <ul className="flex flex-col gap-2.5">
            {colored.map((service) => (
              <li key={service.serviceId ?? 'outros'} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: service.color }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{service.name}</span>
                <span className="shrink-0 text-[13px] font-medium text-fg-muted">
                  {service.pct}% · {formatBRL(service.revenueCents)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
