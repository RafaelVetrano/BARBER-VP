'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppointmentStatusPill,
  Button,
  Drawer,
  EmptyState,
  Skeleton,
  useToast,
} from '@barbervp/ui';
import { AppointmentStatus, formatBRL, formatDuration } from '@barbervp/types';
import type { StaffAppointmentItem } from '@barbervp/types';
import { useOpenOrderMutation } from '@/lib/dashboard/api/pos';
import {
  useCancelStaffAppointmentMutation,
  useConfirmStaffAppointmentMutation,
  useNoShowStaffAppointmentMutation,
  useStaffAppointmentDetailQuery,
} from '@/lib/dashboard/api/agenda';
import { agendaErrorMessage, formatTime, isClosed, shouldWarnNoShow } from './agenda-shared';

export interface AppointmentDrawerProps {
  appointment: StaffAppointmentItem | null;
  timezone: string;
  onClose: () => void;
  /** Abre o modal de remarcação com este agendamento. */
  onReschedule: (appointment: StaffAppointmentItem) => void;
}

/**
 * Drawer de detalhes do agendamento (`Dashboard.dc.html` l.3836–3874).
 *
 * Os dados chegam por `GET /staff-agenda/:id`: o item da grade não carrega o
 * histórico do cliente, e buscá-lo só quando o drawer abre evita puxar as
 * últimas visitas de cada um dos ~40 atendimentos do dia.
 */
export function AppointmentDrawer({
  appointment,
  timezone,
  onClose,
  onReschedule,
}: AppointmentDrawerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const detailQuery = useStaffAppointmentDetailQuery(appointment?.id ?? null);
  const confirm = useConfirmStaffAppointmentMutation();
  const cancel = useCancelStaffAppointmentMutation();
  const noShow = useNoShowStaffAppointmentMutation();
  const openOrder = useOpenOrderMutation();

  // Enquanto o detalhe carrega, o cabeçalho já usa o item da grade: o drawer
  // abre preenchido, sem salto de layout.
  const current = detailQuery.data?.appointment ?? appointment;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast({ message: success, tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: agendaErrorMessage(error), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const closed = current ? isClosed(current.status) : true;

  return (
    <Drawer open={appointment !== null} onClose={onClose} title="Detalhes do agendamento">
      {current && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-xl font-bold text-fg">{current.clientName}</h2>
            {shouldWarnNoShow(current) && (
              <span
                title={`Cliente com ${current.clientNoShowCount} faltas`}
                className="text-warning"
              >
                ⚠
              </span>
            )}
          </div>

          <AppointmentStatusPill status={current.status} className="self-start" />

          <dl className="flex flex-col gap-2 rounded-[10px] border border-border bg-bg p-3.5 text-[13px]">
            <Row
              label="Horário"
              value={`${formatTime(current.startsAt, timezone)} – ${formatTime(current.endsAt, timezone)}`}
            />
            <Row label="Serviço" value={current.services.map((service) => service.name).join(' + ')} />
            <Row label="Barbeiro" value={current.barberName} />
            <Row label="Duração" value={formatDuration(current.durationMin)} />
            <Row label="Total" value={formatBRL(current.totalPriceCents)} />
            <Row label="Código" value={current.bookingCode} />
          </dl>

          {current.notes && (
            <div>
              <p className="mb-2 text-[13px] font-semibold text-fg-muted">Observações</p>
              <p className="rounded-lg border border-border bg-bg p-2.5 text-[13px] text-fg">
                {current.notes}
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-[13px] font-semibold text-fg-muted">Últimas visitas</p>

            {detailQuery.isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </div>
            ) : detailQuery.isError ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg p-2.5">
                <span className="text-[13px] text-fg-muted">Não foi possível carregar.</span>
                <Button variant="ghost" size="sm" onClick={() => void detailQuery.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            ) : (detailQuery.data?.history.length ?? 0) === 0 ? (
              <p className="rounded-lg border border-border bg-bg p-2.5 text-[13px] text-fg-muted">
                {current.isWalkIn
                  ? 'Atendimento avulso — sem histórico nesta barbearia.'
                  : 'Primeira visita deste cliente.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detailQuery.data!.history.map((visit, index) => (
                  <li
                    key={`${visit.date}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-2.5 py-2 text-[13px]"
                  >
                    <span className="shrink-0 text-fg-muted">{formatVisitDate(visit.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-center text-fg">
                      {visit.serviceName}
                    </span>
                    <span className="shrink-0 text-fg">{formatBRL(visit.totalPriceCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Ações (l.3866–3872) ── */}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              size="sm"
              disabled={busy || closed || current.status === AppointmentStatus.CONFIRMED}
              onClick={() => void run(() => confirm.mutateAsync(current.id), 'Agendamento confirmado.')}
            >
              Confirmar
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={busy || current.status === AppointmentStatus.CANCELED}
              onClick={() =>
                void run(async () => {
                  const order = await openOrder.mutateAsync({ appointmentId: current.id });
                  router.push(`/app/comandas?order=${order.id}`);
                }, 'Comanda aberta.')
              }
            >
              Concluir e abrir comanda
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={busy || closed}
              onClick={() => onReschedule(current)}
            >
              Remarcar
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={busy || closed}
              className="border-border text-danger"
              onClick={() =>
                void run(
                  () => cancel.mutateAsync({ id: current.id, dto: { reason: 'Cancelado pela barbearia' } }),
                  'Agendamento cancelado.',
                )
              }
            >
              Cancelar
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={busy || closed || current.isWalkIn}
              className="border-warning text-warning"
              onClick={() =>
                void run(
                  () => noShow.mutateAsync(current.id),
                  'Falta registrada na ficha do cliente.',
                )
              }
            >
              Marcar falta
            </Button>
          </div>
        </div>
      )}

      {!current && <EmptyState message="Agendamento não encontrado." />}
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-fg">{value}</dd>
    </div>
  );
}

function formatVisitDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-') as [string, string, string];
  return `${day}/${month}/${year.slice(2)}`;
}
