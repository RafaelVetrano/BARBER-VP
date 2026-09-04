'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  EmptyState,
  LockIcon,
  PlusIcon,
  Skeleton,
  useEstablishmentAuth,
  useToast,
} from '@barbervp/ui';
import type { BarberListItem, StaffInviteListItem } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { BlockError } from '@/components/dashboard/blocks';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { BarberCard } from '@/components/dashboard/team/barber-card';
import { BarberModal } from '@/components/dashboard/team/barber-modal';
import { InviteRow } from '@/components/dashboard/team/invite-row';
import { ScheduleExceptionModal } from '@/components/dashboard/team/schedule-exception-modal';
import { WeekScheduleMatrix } from '@/components/dashboard/team/week-schedule-matrix';
import { useServicesQuery } from '@/lib/dashboard/api/catalog';
import {
  useBarbersQuery,
  useIssueInviteLinkMutation,
  useResendStaffInviteMutation,
  useRevokeStaffInviteMutation,
  useScheduleExceptionsQuery,
  useStaffInvitesQuery,
  useTeamPlanUsageQuery,
} from '@/lib/dashboard/api/team';

type TeamTab = 'equipe' | 'escala' | 'convites';

const TABS: Array<{ key: TeamTab; label: string }> = [
  { key: 'equipe', label: 'Equipe' },
  { key: 'escala', label: 'Escala semanal' },
  { key: 'convites', label: 'Convites enviados' },
];

/**
 * Aba **Equipe** (`Dashboard.dc.html` l.2023–2239).
 *
 * Três visões nas pílulas do topo, o teto do plano à direita e o banner de
 * downgrade acima de tudo quando o plano encolheu abaixo do tamanho da equipe.
 *
 * Nenhum número desta tela é calculado aqui: o "X de Y" e a lista de quem o
 * plano desligou vêm de `/barbers/plan-usage`, que é o mesmo serviço que
 * devolve 403 na hora de convidar. Contar barbeiro na tela deixaria o rótulo
 * e o gate discordando na primeira corrida.
 */
function EquipeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { activeMembership } = useEstablishmentAuth();

  // `DashboardFuncionario.dc.html` não tem esta aba e `/barbers` responde 403
  // ao `BARBER`. O menu já não oferece o link; isto é para quem chega pela URL.
  const isBarberRole = activeMembership?.role === 'BARBER';

  const requested = searchParams.get('tab') as TeamTab | null;
  const [tab, setTab] = useState<TeamTab>(
    requested && TABS.some((item) => item.key === requested) ? requested : 'equipe',
  );

  const [editing, setEditing] = useState<{ open: boolean; barber: BarberListItem | null }>({
    open: false,
    barber: null,
  });
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<StaffInviteListItem | null>(null);

  const barbersQuery = useBarbersQuery({ enabled: !isBarberRole });
  const invitesQuery = useStaffInvitesQuery();
  const usageQuery = useTeamPlanUsageQuery({ enabled: !isBarberRole });
  const exceptionsQuery = useScheduleExceptionsQuery();
  const servicesQuery = useServicesQuery({ perPage: 100, active: true }, { enabled: !isBarberRole });

  const resend = useResendStaffInviteMutation();
  const revoke = useRevokeStaffInviteMutation();
  const issueLink = useIssueInviteLinkMutation();

  const barbers = barbersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const usage = usageQuery.data;
  const services = servicesQuery.data?.data ?? [];
  const pendingInvites = invites.filter((invite) => invite.status === 'PENDING');

  const goToTab = (next: TeamTab) => {
    setTab(next);
    router.replace(`/app/equipe?tab=${next}`, { scroll: false });
  };

  const openNewBarber = () => {
    // O 403 continua sendo do servidor; aqui só se antecipa o motivo, para o
    // dono não preencher o modal inteiro antes de descobrir que não cabe.
    if (usage && !usage.canAddBarber) {
      toast({
        message: `O plano ${usage.planName ?? 'atual'} permite até ${usage.maxBarbers} barbeiro(s). Faça upgrade para convidar mais.`,
        tone: 'danger',
      });
      router.push('/app/configuracoes?tab=plano');
      return;
    }
    setEditing({ open: true, barber: null });
  };

  const copyInviteLink = async (invite: StaffInviteListItem) => {
    try {
      const { url } = await issueLink.mutateAsync(invite.id);
      await navigator.clipboard.writeText(url);
      toast({
        message: 'Link copiado. Ele substitui o que foi enviado por e-mail.',
        tone: 'success',
      });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível gerar o link.',
        tone: 'danger',
      });
    }
  };

  const resendInvite = async (invite: StaffInviteListItem) => {
    try {
      await resend.mutateAsync(invite.id);
      toast({ message: `Convite reenviado para ${invite.email}.`, tone: 'success' });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível reenviar.',
        tone: 'danger',
      });
    }
  };

  const cancelInvite = async () => {
    if (!confirmCancel) return;
    try {
      await revoke.mutateAsync(confirmCancel.id);
      toast({ message: 'Convite cancelado.', tone: 'success' });
      setConfirmCancel(null);
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível cancelar.',
        tone: 'danger',
      });
    }
  };

  if (isBarberRole) {
    return (
      <DashboardChrome activeKey="equipe">
        <EmptyState
          illustration={<LockIcon size={40} />}
          message="A equipe é administrada pelo dono ou gerente da barbearia."
          description="Sua agenda, suas comandas e suas comissões continuam no menu."
        />
      </DashboardChrome>
    );
  }

  return (
    <DashboardChrome activeKey="equipe">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Equipe</h1>

        {usage && usage.inactiveByPlanNames.length > 0 && (
          <DowngradeBanner
            names={usage.inactiveByPlanNames}
            maxBarbers={usage.maxBarbers}
            onUpgrade={() => router.push('/app/configuracoes?tab=plano')}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Equipe"
            className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:w-fit md:overflow-visible md:rounded-[10px] md:border md:border-border md:bg-surface-2 md:px-1 md:py-1"
          >
            {TABS.map((item) => (
              <button
                key={item.key}
                role="tab"
                type="button"
                aria-selected={tab === item.key}
                onClick={() => goToTab(item.key)}
                className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:h-9 ${
                  tab === item.key ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {item.label}
                {/* O desenho só põe contador na terceira pílula, e só quando há
                    convite parado esperando alguém (l.2037). */}
                {item.key === 'convites' && pendingInvites.length > 0 && (
                  <span className="grid size-[18px] place-items-center rounded-full bg-gold text-[11px] font-semibold text-bg">
                    {pendingInvites.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3.5">
            <PlanUsage
              pending={usageQuery.isPending}
              usage={usage}
              onRetry={() => void usageQuery.refetch()}
              failed={usageQuery.isError}
            />
            <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={openNewBarber}>
              Novo barbeiro
            </Button>
          </div>
        </div>

        {tab === 'equipe' &&
          (barbersQuery.isPending ? (
            <GridSkeleton />
          ) : barbersQuery.isError ? (
            <BlockError label="a equipe" onRetry={() => void barbersQuery.refetch()} />
          ) : barbers.length === 0 ? (
            <EmptyState
              message="Nenhum barbeiro na equipe ainda."
              description="Convide o primeiro pelo botão Novo barbeiro — ele recebe um e-mail para criar a própria senha."
              action={<Button onClick={openNewBarber}>Convidar o primeiro barbeiro</Button>}
            />
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}
            >
              {barbers.map((barber) => (
                <BarberCard
                  key={barber.id}
                  barber={barber}
                  onEdit={() => setEditing({ open: true, barber })}
                  onViewAgenda={() => router.push(`/app/agenda?barbeiro=${barber.id}`)}
                />
              ))}
            </div>
          ))}

        {tab === 'escala' &&
          (barbersQuery.isPending || exceptionsQuery.isPending ? (
            <Skeleton className="h-[320px] rounded-xl" />
          ) : barbersQuery.isError ? (
            <BlockError label="a escala" onRetry={() => void barbersQuery.refetch()} />
          ) : (
            <WeekScheduleMatrix
              barbers={barbers}
              // A escala segue de pé se as exceções falharem: sem elas a matriz
              // perde o ícone de férias, não a semana inteira.
              exceptions={exceptionsQuery.data ?? []}
              onEditBarber={(barber) => setEditing({ open: true, barber })}
              onNewException={() => setExceptionOpen(true)}
            />
          ))}

        {tab === 'convites' &&
          (invitesQuery.isPending ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 2 }, (_, index) => (
                <Skeleton key={index} className="h-[96px] rounded-2xl" />
              ))}
            </div>
          ) : invitesQuery.isError ? (
            <BlockError label="os convites" onRetry={() => void invitesQuery.refetch()} />
          ) : invites.length === 0 ? (
            <EmptyState
              illustration={<EnvelopeIcon />}
              message="Nenhum convite pendente. Convide um barbeiro pelo botão Novo barbeiro."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {invites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  services={services}
                  busy={resend.isPending || revoke.isPending || issueLink.isPending}
                  onResend={() => void resendInvite(invite)}
                  onCancel={() => setConfirmCancel(invite)}
                  onCopyLink={() => void copyInviteLink(invite)}
                />
              ))}
            </div>
          ))}
      </div>

      <BarberModal
        open={editing.open}
        onClose={() => setEditing({ open: false, barber: null })}
        barber={editing.barber}
        services={services}
      />
      <ScheduleExceptionModal
        open={exceptionOpen}
        onClose={() => setExceptionOpen(false)}
        barbers={barbers}
      />
      <ConfirmDialog
        open={confirmCancel !== null}
        onClose={() => setConfirmCancel(null)}
        title="Cancelar convite"
        description={`O link enviado para ${confirmCancel?.email ?? ''} para de funcionar na hora e a vaga volta para o plano. Para convidar de novo, mande um novo convite.`}
        confirmLabel="Cancelar convite"
        cancelLabel="Manter convite"
        tone="danger"
        busy={revoke.isPending}
        onConfirm={() => void cancelInvite()}
      />
    </DashboardChrome>
  );
}

/**
 * Banner do downgrade (l.2025). Cita cada barbeiro pelo nome porque a decisão
 * que ele pede — quem fica e quem sai — depende de saber quem foi desligado.
 */
function DowngradeBanner({
  names,
  maxBarbers,
  onUpgrade,
}: {
  names: string[];
  maxBarbers: number | null;
  onUpgrade: () => void;
}) {
  const list =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-danger/40 bg-danger/10 px-4 py-3.5"
    >
      <p className="text-[13px] font-medium text-fg">
        {maxBarbers !== null && `Seu plano permite ${maxBarbers} barbeiro(s). `}
        {list} {names.length === 1 ? 'foi marcado' : 'foram marcados'} como{' '}
        {names.length === 1 ? 'inativo' : 'inativos'} — {names.length === 1 ? 'ele não aparece' : 'eles não aparecem'} na
        agenda nem {names.length === 1 ? 'recebe' : 'recebem'} novos agendamentos. Faça upgrade para{' '}
        {names.length === 1 ? 'reativá-lo' : 'reativá-los'}.
      </p>
      <Button size="sm" className="whitespace-nowrap" onClick={onUpgrade}>
        Fazer upgrade
      </Button>
    </div>
  );
}

/** "Barbeiros: X de Y" com a barra de uso (l.2043). */
function PlanUsage({
  usage,
  pending,
  failed,
  onRetry,
}: {
  usage: ReturnType<typeof useTeamPlanUsageQuery>['data'];
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  if (pending) {
    return <Skeleton className="h-[34px] w-[120px] rounded-lg" />;
  }
  if (failed || !usage) {
    return (
      <button type="button" onClick={onRetry} className="text-xs text-fg-muted underline">
        Recarregar o uso do plano
      </button>
    );
  }

  const used = usage.activeBarbers + usage.pendingInvites;
  // Ilimitado não tem barra: uma barra sem teto não representa nada.
  const showBar = usage.maxBarbers !== null;
  const ratio = usage.maxBarbers ? Math.min(1, used / usage.maxBarbers) : 0;

  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <span className="whitespace-nowrap text-xs font-medium text-fg-muted">
        Barbeiros: {used} {usage.maxBarbers === null ? '(ilimitado)' : `de ${usage.maxBarbers}`}
      </span>
      {showBar && (
        <div
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={usage.maxBarbers ?? used}
          aria-label="Barbeiros usados no plano"
          className="h-1.5 w-[110px] overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={`h-full rounded-full ${ratio >= 1 ? 'bg-danger' : 'bg-gold'}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Esqueleto na altura dos cards — carregar não pode empurrar o layout. */
function GridSkeleton() {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[248px] rounded-xl" />
      ))}
    </div>
  );
}

/** O envelope do estado vazio de convites (l.2151). */
function EnvelopeIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4h16v16H4z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 6l8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** `useSearchParams()` (a sub-aba inicial vem de `?tab=`) exige o Suspense. */
export default function EquipePage() {
  return (
    <Suspense fallback={null}>
      <EquipeContent />
    </Suspense>
  );
}
