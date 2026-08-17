'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, EmptyState, PlusIcon, Skeleton, StatCard, useEstablishmentAuth } from '@barbervp/ui';
import { AgendaView, formatBRL } from '@barbervp/types';
import { DashboardChrome } from '../components/dashboard-chrome';
import { useStaffAgendaQuery } from '../lib/api/agenda';
import { useProductsQuery } from '../lib/api/catalog';

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Home do painel — mesmo componente serve `Dashboard` e `DashboardFuncionario`:
 * o backend já devolve só a própria coluna quando o papel é BARBER, então o
 * resumo "hoje" nasce corretamente escopado sem nenhum `if (role)` aqui.
 */
export default function DashboardHomePage() {
  const router = useRouter();
  const { activeMembership } = useEstablishmentAuth();
  const isOwnerOrManager = activeMembership?.role === 'OWNER' || activeMembership?.role === 'MANAGER';

  const agendaQuery = useStaffAgendaQuery({ date: todayKey(), view: AgendaView.DAY });
  const lowStockQuery = useProductsQuery({ lowStock: true, perPage: 5 });

  const appointments = useMemo(
    () => (agendaQuery.data?.days[0]?.barbers.flatMap((column) => column.appointments) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [agendaQuery.data],
  );

  const active = appointments.filter((appointment) => appointment.status !== 'CANCELED');
  const confirmed = active.filter((appointment) => appointment.status === 'CONFIRMED').length;
  const revenueToday = active.reduce((total, appointment) => total + appointment.totalPriceCents, 0);
  const nextAppointments = active.filter((appointment) => new Date(appointment.startsAt) >= new Date()).slice(0, 6);

  return (
    <DashboardChrome
      activeKey="dashboard"
      topbarActions={
        <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => router.push('/agenda')}>
          Novo agendamento
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">
          Olá, {activeMembership?.tenantName ?? 'barbearia'} 👋
        </h1>

        {agendaQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Agendamentos hoje" value={active.length} hint={`${confirmed} confirmados`} />
            <StatCard label="Faturamento previsto hoje" value={formatBRL(revenueToday)} />
            {isOwnerOrManager && (
              <StatCard
                label="Estoque baixo"
                value={lowStockQuery.data?.meta.total ?? 0}
                hint={lowStockQuery.data && lowStockQuery.data.meta.total > 0 ? 'Reponha em Serviços & Produtos' : 'Tudo certo'}
              />
            )}
            <StatCard label="Barbeiros na agenda" value={agendaQuery.data?.barberOptions.length ?? 0} />
          </div>
        )}

        <Card>
          <CardHeader title="Próximos horários de hoje" action={<Button variant="ghost" size="sm" onClick={() => router.push('/agenda')}>Ver agenda completa</Button>} />
          {nextAppointments.length === 0 ? (
            <EmptyState message="Nenhum horário à frente hoje." className="py-8" />
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {nextAppointments.map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
                >
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-gold">
                    {new Intl.DateTimeFormat('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: agendaQuery.data?.timezone,
                    }).format(new Date(appointment.startsAt))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{appointment.clientName}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {appointment.barberName} · {appointment.services.map((service) => service.name).join(' + ')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DashboardChrome>
  );
}
