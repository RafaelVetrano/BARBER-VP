'use client';

import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Menu,
  Modal,
  PlusIcon,
  Select,
  Skeleton,
  Tabs,
  useEstablishmentAuth,
  useToast,
} from '@barbervp/ui';
import { AgendaView, formatBRL, WEEKDAY_LABELS } from '@barbervp/types';
import type { StaffAppointmentItem } from '@barbervp/types';
import { DashboardChrome } from '../../components/dashboard-chrome';
import { AppointmentFormModal } from '../../components/agenda/appointment-form-modal';
import {
  useCancelStaffAppointmentMutation,
  useMoveStaffAppointmentMutation,
  useStaffAgendaQuery,
} from '../../lib/api/agenda';

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDaysToKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const date = new Date(year, (month ?? 1) - 1, (day ?? 1) + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function AppointmentRow({
  appointment,
  timezone,
  onCancel,
  onMove,
}: {
  appointment: StaffAppointmentItem;
  timezone: string;
  onCancel: () => void;
  onMove: () => void;
}) {
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(appointment.startsAt));

  const changeable = !['CANCELED', 'DONE', 'NO_SHOW'].includes(appointment.status);

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-gold">{time}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">
          {appointment.clientName}
          {appointment.isWalkIn && (
            <Badge tone="neutral" className="ml-2">
              Avulso
            </Badge>
          )}
        </p>
        <p className="truncate text-xs text-fg-muted">
          {appointment.services.map((service) => service.name).join(' + ')} ·{' '}
          {formatBRL(appointment.totalPriceCents)}
        </p>
      </div>
      {appointment.status === 'CANCELED' ? (
        <Badge tone="neutral">Cancelado</Badge>
      ) : (
        changeable && (
          <Menu
            label={`Ações de ${appointment.clientName}`}
            items={[
              { label: 'Mover horário', onSelect: onMove },
              { label: 'Cancelar', destructive: true, onSelect: onCancel },
            ]}
          />
        )
      )}
    </li>
  );
}

function MoveModal({
  appointment,
  onClose,
}: {
  appointment: StaffAppointmentItem | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const move = useMoveStaffAppointmentMutation();
  const [time, setTime] = useState('');

  if (!appointment) return null;

  const dateKey = appointment.startsAt.slice(0, 10);

  const submit = async () => {
    if (!time) return;
    try {
      await move.mutateAsync({
        id: appointment.id,
        dto: { startsAt: new Date(`${dateKey}T${time}:00`).toISOString() },
      });
      toast({ message: 'Agendamento movido.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível mover.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Mover horário"
      footer={
        <Button fullWidth loading={move.isPending} disabled={!time} onClick={() => void submit()}>
          Confirmar
        </Button>
      }
    >
      <p className="mb-3 text-sm text-fg-muted">
        Novo horário para <strong className="text-fg">{appointment.clientName}</strong>, no mesmo dia.
      </p>
      <Input label="Horário" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
    </Modal>
  );
}

export default function AgendaPage() {
  const { activeMembership } = useEstablishmentAuth();
  const { toast } = useToast();
  const role = activeMembership?.role;
  const isStaffOnly = role === 'BARBER';

  const [date, setDate] = useState(todayKey());
  const [view, setView] = useState<'DAY' | 'WEEK'>('DAY');
  const [barberFilter, setBarberFilter] = useState<string>('');
  const [modalBarberId, setModalBarberId] = useState<string | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<StaffAppointmentItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<StaffAppointmentItem | null>(null);

  const agendaQuery = useStaffAgendaQuery({
    date,
    view: view === 'WEEK' ? AgendaView.WEEK : AgendaView.DAY,
    barberId: barberFilter || undefined,
  });
  const cancel = useCancelStaffAppointmentMutation();

  const data = agendaQuery.data;
  const day = data?.days[0];

  const openNewFor = (barberId?: string) => {
    setModalBarberId(barberId);
    setModalOpen(true);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancel.mutateAsync({ id: cancelTarget.id, dto: {} });
      toast({ message: 'Agendamento cancelado.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível cancelar.', tone: 'danger' });
    } finally {
      setCancelTarget(null);
    }
  };

  return (
    <DashboardChrome
      activeKey="agenda"
      topbarActions={
        <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => openNewFor(isStaffOnly ? data?.barberOptions[0]?.id : undefined)}>
          Novo agendamento
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold text-fg">Agenda</h1>

          {/* Semana/colunas só faz sentido em telas largas — regra de responsividade da fase. */}
          <div className="hidden lg:block">
            <Tabs
              label="Visão da agenda"
              variant="segmented"
              value={view}
              onChange={(value) => setView(value as 'DAY' | 'WEEK')}
              items={[
                { value: 'DAY', label: 'Dia' },
                { value: 'WEEK', label: 'Semana' },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDate((current) => addDaysToKey(current, -1))}>
            ← Anterior
          </Button>
          <Input
            aria-label="Data"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-auto"
          />
          <Button variant="outline" size="sm" onClick={() => setDate((current) => addDaysToKey(current, 1))}>
            Próximo →
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDate(todayKey())}>
            Hoje
          </Button>

          {!isStaffOnly && data && data.barberOptions.length > 1 && (
            <Select
              aria-label="Filtrar por barbeiro"
              className="w-auto min-w-[180px]"
              value={barberFilter}
              onChange={(event) => setBarberFilter(event.target.value)}
              options={[
                { value: '', label: 'Todos os barbeiros' },
                ...data.barberOptions.map((barber) => ({ value: barber.id, label: barber.name })),
              ]}
            />
          )}
        </div>

        {agendaQuery.isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        )}

        {/* ── Visão dia: colunas por barbeiro em telas largas, empilhado no mobile ── */}
        {view === 'DAY' && day && (
          <div className="grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
            {day.barbers.map((column) => (
              <Card key={column.barberId} className="gap-3">
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Avatar name={column.barberName} size="sm" />
                      {column.barberName}
                    </span>
                  }
                  action={
                    !isStaffOnly && (
                      <Button size="sm" variant="ghost" onClick={() => openNewFor(column.barberId)}>
                        + Agendar
                      </Button>
                    )
                  }
                />
                {column.appointments.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-fg-muted">Sem agendamentos.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {column.appointments.map((appointment) => (
                      <AppointmentRow
                        key={appointment.id}
                        appointment={appointment}
                        timezone={data!.timezone}
                        onCancel={() => setCancelTarget(appointment)}
                        onMove={() => setMoveTarget(appointment)}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            ))}

            {day.barbers.length === 0 && (
              <EmptyState message="Nenhum barbeiro ativo com agenda hoje." className="col-span-full" />
            )}
          </div>
        )}

        {/* ── Visão semana: só ≥ lg (regra de responsividade) ── */}
        {view === 'WEEK' && data && (
          <div className="hidden overflow-x-auto lg:block">
            <div className="grid min-w-[980px] grid-cols-7 gap-3">
              {data.days.map((weekDay) => (
                <Card key={weekDay.date} tone="raised" className="gap-2">
                  <p className="text-center text-[12px] font-semibold uppercase text-fg-muted">
                    {WEEKDAY_LABELS[weekDay.weekday]?.slice(0, 3)} · {weekDay.date.slice(8, 10)}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {weekDay.barbers.flatMap((column) =>
                      column.appointments.map((appointment) => (
                        <li
                          key={appointment.id}
                          className="rounded-md bg-surface-2 px-2 py-1.5 text-[11px] text-fg"
                        >
                          <span className="font-semibold text-gold">
                            {new Intl.DateTimeFormat('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: data.timezone,
                            }).format(new Date(appointment.startsAt))}
                          </span>{' '}
                          {appointment.clientName}
                          <span className="block truncate text-fg-muted">{column.barberName}</span>
                        </li>
                      )),
                    )}
                    {weekDay.barbers.every((column) => column.appointments.length === 0) && (
                      <li className="py-2 text-center text-[11px] text-fg-subtle">—</li>
                    )}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <AppointmentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        date={date}
        barbers={data?.barberOptions ?? []}
        fixedBarberId={isStaffOnly ? data?.barberOptions[0]?.id : modalBarberId}
      />

      <MoveModal appointment={moveTarget} onClose={() => setMoveTarget(null)} />

      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Cancelar agendamento"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setCancelTarget(null)}>
              Voltar
            </Button>
            <Button variant="danger" fullWidth loading={cancel.isPending} onClick={() => void confirmCancel()}>
              Cancelar agendamento
            </Button>
          </div>
        }
      >
        <p className="text-sm text-fg-muted">
          Tem certeza que quer cancelar o horário de{' '}
          <strong className="text-fg">{cancelTarget?.clientName}</strong>? Esta ação não pode ser desfeita.
        </p>
      </Modal>
    </DashboardChrome>
  );
}
