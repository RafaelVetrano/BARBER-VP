'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppointmentStatusPill,
  Card,
  EmptyState,
  Menu,
  cn,
  useToast,
} from '@barbervp/ui';
import type { DashboardUpcomingAppointment } from '@barbervp/types';
import {
  useCancelStaffAppointmentMutation,
  useConfirmStaffAppointmentMutation,
} from '@/lib/dashboard/api/agenda';
import { useOpenOrderMutation } from '@/lib/dashboard/api/pos';

/**
 * Card "Próximos atendimentos (hoje)" (`Dashboard.dc.html`, linhas 308–336):
 * hora tabular de 44px, cliente + "serviço · barbeiro", pílula de status e o
 * menu ⋯ com Confirmar / Remarcar / Abrir comanda / Cancelar.
 *
 * As quatro ações são reais: confirmar e cancelar chamam a API e revalidam o
 * dashboard; "Abrir comanda" abre a comanda ligada ao agendamento e navega
 * para ela; "Remarcar" leva à Agenda, que é onde a grade de horários existe —
 * duplicar aqui o seletor de slot seria uma segunda implementação da mesma
 * regra de disponibilidade.
 */
export function UpcomingCard({ appointments }: { appointments: DashboardUpcomingAppointment[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const confirmMutation = useConfirmStaffAppointmentMutation();
  const cancelMutation = useCancelStaffAppointmentMutation();
  const openOrderMutation = useOpenOrderMutation();

  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    try {
      await action();
      toast({ tone: 'success', message: success });
    } catch {
      toast({ tone: 'danger', message: 'Não foi possível concluir a ação.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="gap-3 p-5">
      <h2 className="font-display text-base font-bold text-fg">Próximos atendimentos (hoje)</h2>

      {appointments.length === 0 ? (
        <EmptyState className="py-10" message="Nenhum atendimento marcado para hoje" />
      ) : (
        <ul className="flex flex-col">
          {appointments.map((appointment) => {
            const canceled = appointment.status === 'CANCELED';
            const closed = canceled || appointment.status === 'DONE' || appointment.status === 'NO_SHOW';

            return (
              <li
                key={appointment.id}
                className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-b-0"
              >
                <span className="w-11 shrink-0 text-[13px] font-semibold tabular-nums text-fg">
                  {appointment.time}
                </span>

                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      'truncate text-[13px] font-medium text-fg',
                      canceled && 'line-through',
                    )}
                  >
                    {appointment.clientName}
                  </span>
                  <span className="truncate text-xs text-fg-muted">
                    {appointment.serviceName} · {appointment.barberName}
                  </span>
                </div>

                <AppointmentStatusPill status={appointment.status} />

                <Menu
                  label={`Ações de ${appointment.clientName}`}
                  align="end"
                  items={[
                    {
                      label: 'Confirmar',
                      disabled: closed || appointment.status === 'CONFIRMED' || busyId !== null,
                      onSelect: () =>
                        void run(
                          appointment.id,
                          () => confirmMutation.mutateAsync(appointment.id),
                          'Agendamento confirmado.',
                        ),
                    },
                    {
                      label: 'Remarcar',
                      disabled: closed,
                      onSelect: () => router.push('/app/agenda'),
                    },
                    {
                      label: 'Abrir comanda',
                      disabled: canceled || busyId !== null,
                      onSelect: () =>
                        void run(
                          appointment.id,
                          async () => {
                            const order = await openOrderMutation.mutateAsync({
                              appointmentId: appointment.id,
                            });
                            router.push(`/app/comandas?order=${order.id}`);
                          },
                          'Comanda aberta.',
                        ),
                    },
                    {
                      label: 'Cancelar',
                      destructive: true,
                      disabled: closed || busyId !== null,
                      onSelect: () =>
                        void run(
                          appointment.id,
                          () =>
                            cancelMutation.mutateAsync({
                              id: appointment.id,
                              dto: { reason: 'Cancelado pelo dashboard' },
                            }),
                          'Agendamento cancelado.',
                        ),
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
