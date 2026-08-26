'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, EmptyState, Skeleton, useEstablishmentAuth, useToast } from '@barbervp/ui';
import { AgendaView } from '@barbervp/types';
import type { StaffAppointmentItem } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { AgendaToolbar, type AgendaTab } from '@/components/dashboard/agenda/agenda-toolbar';
import { AgendaDayGrid } from '@/components/dashboard/agenda/agenda-day-grid';
import { AgendaWeekGrid } from '@/components/dashboard/agenda/agenda-week-grid';
import { AgendaMonthGrid } from '@/components/dashboard/agenda/agenda-month-grid';
import { AgendaTimeline } from '@/components/dashboard/agenda/agenda-timeline';
import { AppointmentDrawer } from '@/components/dashboard/agenda/appointment-drawer';
import { AppointmentFormModal } from '@/components/dashboard/agenda/appointment-form-modal';
import { BlockTimeModal } from '@/components/dashboard/agenda/block-time-modal';
import {
  addDaysToKey,
  addMonthsToKey,
  todayKey,
} from '@/components/dashboard/agenda/agenda-shared';
import { useStaffAgendaMonthQuery, useStaffAgendaQuery } from '@/lib/dashboard/api/agenda';

/** Semana e Timeline não cabem em telas estreitas — regra 6 da fase. */
const WIDE_ONLY: AgendaTab[] = ['WEEK', 'TIMELINE'];

function AgendaContent() {
  const { activeMembership } = useEstablishmentAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const isStaffOnly = activeMembership?.role === 'BARBER';

  const [date, setDate] = useState(() => searchParams.get('date') ?? todayKey());
  const [view, setView] = useState<AgendaTab>('DAY');
  // `?barbeiro=` é o contrato do "Ver agenda" do card da aba Equipe: abrir a
  // agenda JÁ filtrada por aquele barbeiro, e não a grade inteira para o dono
  // procurar a coluna dele.
  const [barberIds, setBarberIds] = useState<string[]>(() => {
    const requested = searchParams.get('barbeiro');
    return requested ? [requested] : [];
  });
  const [drawerAppointment, setDrawerAppointment] = useState<StaffAppointmentItem | null>(null);
  const [rescheduling, setRescheduling] = useState<StaffAppointmentItem | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(() => searchParams.get('novo') === '1');
  const [formBarberId, setFormBarberId] = useState<string | undefined>(undefined);
  const [formTime, setFormTime] = useState<string | undefined>(undefined);
  const [formClientId, setFormClientId] = useState<string | null>(() => searchParams.get('cliente'));

  // Pontos de entrada vindos de fora: `?novo=1` (o CTA da topbar), `?date=`
  // (um resultado da busca global), `?cliente=` (o "Agendar" da aba Clientes)
  // e `?barbeiro=` (o "Ver agenda" do card da aba Equipe).
  useEffect(() => {
    if (searchParams.get('novo') === '1') setFormOpen(true);
    const requested = searchParams.get('date');
    if (requested) setDate(requested);
    setFormClientId(searchParams.get('cliente'));
    const barber = searchParams.get('barbeiro');
    if (barber) setBarberIds([barber]);
  }, [searchParams]);

  const isMonth = view === 'MONTH';

  const agendaQuery = useStaffAgendaQuery(
    {
      date,
      view: view === 'WEEK' ? AgendaView.WEEK : view === 'TIMELINE' ? AgendaView.TIMELINE : AgendaView.DAY,
      barberIds,
    },
    !isMonth,
  );
  const monthQuery = useStaffAgendaMonthQuery({ date, barberIds }, isMonth);

  const agenda = agendaQuery.data;
  const day = agenda?.days.find((row) => row.date === date) ?? agenda?.days[0];
  const barberOptions = useMemo(() => agenda?.barberOptions ?? [], [agenda]);

  const openForm = (barberId?: string, time?: string) => {
    setFormBarberId(barberId ?? (isStaffOnly ? barberOptions[0]?.id : undefined));
    setFormTime(time);
    // Abrir o formulário pela própria grade não herda o cliente da URL.
    setFormClientId(null);
    setRescheduling(null);
    setFormOpen(true);
  };

  const copyLink = async () => {
    const slug = activeMembership?.tenantSlug;
    if (!slug) return;
    const url = `${window.location.origin}/agendar/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ message: 'Link de agendamento copiado.', tone: 'success' });
    } catch {
      // Área de transferência bloqueada (http, permissão negada): o link
      // ainda precisa chegar ao operador de alguma forma.
      toast({ message: `Link de agendamento: ${url}`, tone: 'neutral' });
    }
  };

  const step = view === 'MONTH' ? 0 : view === 'WEEK' ? 7 : 1;

  const navigate = (direction: 1 | -1) => {
    setDate((current) =>
      view === 'MONTH'
        ? addMonthsToKey(current, direction)
        : addDaysToKey(current, step * direction),
    );
  };

  const goToDay = (target: string) => {
    setDate(target);
    setView('DAY');
  };

  const loading = isMonth ? monthQuery.isLoading : agendaQuery.isLoading;
  const error = isMonth ? monthQuery.isError : agendaQuery.isError;

  return (
    <DashboardChrome activeKey="agenda">
      <div className="flex flex-col gap-4.5">
        <AgendaToolbar
          date={date}
          onDateChange={setDate}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
          onToday={() => setDate(todayKey())}
          view={view}
          onViewChange={setView}
          barberOptions={barberOptions}
          selectedBarberIds={barberIds}
          onToggleBarber={(barberId) =>
            setBarberIds((current) => {
              // Lista vazia significa "todos": o primeiro clique tira UM da
              // seleção completa, e não deixa apenas ele marcado.
              const base = current.length === 0 ? barberOptions.map((barber) => barber.id) : current;
              const next = base.includes(barberId)
                ? base.filter((id) => id !== barberId)
                : [...base, barberId];
              return next.length === barberOptions.length ? [] : next;
            })
          }
          showBarberFilter={!isStaffOnly}
          onOpenBlock={() => setBlockOpen(true)}
          onCopyLink={() => void copyLink()}
          onNewAppointment={() => openForm()}
        />

        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4">
            <p className="text-[13px] text-fg">Não foi possível carregar a agenda.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void (isMonth ? monthQuery.refetch() : agendaQuery.refetch())}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {/* Skeleton com a altura da grade — sem salto ao carregar. */}
        {loading && !agenda && !monthQuery.data && !error && <Skeleton className="h-[520px]" />}

        {/* ── Semana e Timeline só ≥ lg; abaixo disso, aviso e volta para o Dia ── */}
        {WIDE_ONLY.includes(view) && (
          <div className="lg:hidden">
            <EmptyState
              message="Visão para telas maiores"
              description="Semana e Timeline precisam de largura para caber. No celular, use a visão Dia."
              action={
                <Button size="sm" onClick={() => setView('DAY')}>
                  Ver o dia
                </Button>
              }
            />
          </div>
        )}

        {view === 'DAY' && agenda && day && (
          <AgendaDayGrid
            day={day}
            agenda={agenda}
            onOpenAppointment={setDrawerAppointment}
            onPickSlot={(barberId, time) => openForm(barberId, time)}
          />
        )}

        {view === 'WEEK' && agenda && (
          <div className="hidden lg:block">
            <AgendaWeekGrid
              agenda={agenda}
              onOpenAppointment={setDrawerAppointment}
              onOpenDay={goToDay}
            />
          </div>
        )}

        {view === 'TIMELINE' && agenda && day && (
          <div className="hidden lg:block">
            <AgendaTimeline day={day} agenda={agenda} onOpenAppointment={setDrawerAppointment} />
          </div>
        )}

        {view === 'MONTH' && (
          <AgendaMonthGrid
            month={monthQuery.data}
            date={date}
            loading={monthQuery.isLoading}
            onOpenDay={goToDay}
          />
        )}
      </div>

      <AppointmentDrawer
        appointment={drawerAppointment}
        timezone={agenda?.timezone ?? 'America/Sao_Paulo'}
        onClose={() => setDrawerAppointment(null)}
        onReschedule={(appointment) => {
          setDrawerAppointment(null);
          setRescheduling(appointment);
          setFormBarberId(undefined);
          setFormTime(undefined);
          setFormOpen(true);
        }}
      />

      <AppointmentFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setRescheduling(null);
          setFormClientId(null);
        }}
        date={date}
        timezone={agenda?.timezone ?? 'America/Sao_Paulo'}
        barbers={barberOptions}
        fixedBarberId={isStaffOnly ? barberOptions[0]?.id : formBarberId}
        defaultTime={formTime}
        preselectedClientId={formClientId}
        rescheduling={rescheduling}
      />

      <BlockTimeModal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        date={date}
        barberOptions={barberOptions}
        fixedBarberId={isStaffOnly ? barberOptions[0]?.id : undefined}
      />
    </DashboardChrome>
  );
}

/**
 * `useSearchParams()` (`?novo=1` da topbar, `?date=` da busca global) tira a
 * rota da renderização estática: sem um limite de Suspense o `next build`
 * falha no prerender — a mesma armadilha documentada em `configuracoes/page.tsx`.
 */
export default function AgendaPage() {
  return (
    <Suspense fallback={<AgendaFallback />}>
      <AgendaContent />
    </Suspense>
  );
}

function AgendaFallback() {
  return (
    <DashboardChrome activeKey="agenda">
      <div className="flex flex-col gap-4.5">
        <Skeleton className="h-10" />
        <Skeleton className="h-[520px]" />
      </div>
    </DashboardChrome>
  );
}
