'use client';

import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Menu,
  PlusIcon,
  ResponsiveTable,
  Select,
  Tabs,
  type TableColumn,
} from '@barbervp/ui';
import type { BarberListItem, StaffInviteListItem } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { BarberModal } from '@/components/dashboard/team/barber-modal';
import { InviteModal } from '@/components/dashboard/team/invite-modal';
import { WorkScheduleEditor } from '@/components/dashboard/team/work-schedule-editor';
import { useServicesQuery } from '@/lib/dashboard/api/catalog';
import {
  useBarbersQuery,
  useResendStaffInviteMutation,
  useRevokeStaffInviteMutation,
  useStaffInvitesQuery,
  useUpdateBarberMutation,
} from '@/lib/dashboard/api/team';

const INVITE_STATUS_TONE: Record<StaffInviteListItem['status'], 'gold' | 'success' | 'neutral' | 'danger'> = {
  PENDING: 'gold',
  ACCEPTED: 'success',
  EXPIRED: 'neutral',
  REVOKED: 'danger',
};

const INVITE_STATUS_LABEL: Record<StaffInviteListItem['status'], string> = {
  PENDING: 'Pendente',
  ACCEPTED: 'Aceito',
  EXPIRED: 'Expirado',
  REVOKED: 'Revogado',
};

function TeamGrid({ barbers, onEdit }: { barbers: BarberListItem[]; onEdit: (barber: BarberListItem) => void }) {
  const updateBarber = useUpdateBarberMutation();

  if (barbers.length === 0) {
    return <EmptyState message="Nenhum barbeiro cadastrado ainda." />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {barbers.map((barber) => (
        <Card key={barber.id} className="gap-3">
          <div className="flex items-start gap-3">
            <Avatar name={barber.name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{barber.name}</p>
              <p className="truncate text-xs text-fg-muted">{barber.specialty ?? 'Sem especialidade definida'}</p>
            </div>
            <Menu
              label={`Ações de ${barber.name}`}
              items={[
                { label: 'Editar', onSelect: () => onEdit(barber) },
                ...(barber.isOwner
                  ? []
                  : [
                      {
                        label: barber.active ? 'Desativar' : 'Reativar',
                        destructive: barber.active,
                        onSelect: () => updateBarber.mutate({ id: barber.id, dto: { active: !barber.active } }),
                      },
                    ]),
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {barber.isOwner && <Badge tone="gold">Dono</Badge>}
            {barber.hasLogin && !barber.isOwner && <Badge tone="info">Login próprio</Badge>}
            <Badge tone={barber.active ? 'success' : 'neutral'}>{barber.active ? 'Ativo' : 'Inativo'}</Badge>
            <Badge tone="neutral">{barber.serviceIds.length} serviço(s)</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

function InvitesTab({ invites }: { invites: StaffInviteListItem[] }) {
  const resend = useResendStaffInviteMutation();
  const revoke = useRevokeStaffInviteMutation();

  const columns: TableColumn<StaffInviteListItem>[] = [
    { key: 'name', header: 'Nome', mobile: 'title', render: (row) => row.name },
    { key: 'email', header: 'E-mail', mobile: 'subtitle', render: (row) => row.email },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => <Badge tone={INVITE_STATUS_TONE[row.status]}>{INVITE_STATUS_LABEL[row.status]}</Badge>,
    },
    {
      key: 'expires',
      header: 'Expira em',
      mobile: 'meta',
      render: (row) => new Date(row.expiresAt).toLocaleDateString('pt-BR'),
    },
  ];

  return (
    <ResponsiveTable
      columns={columns}
      rows={invites}
      getRowKey={(row) => row.id}
      caption="Convites de equipe"
      actions={(row) =>
        row.status === 'PENDING'
          ? [
              { label: 'Reenviar', onSelect: () => resend.mutate(row.id) },
              { label: 'Revogar', destructive: true, onSelect: () => revoke.mutate(row.id) },
            ]
          : []
      }
      empty={<EmptyState message="Nenhum convite enviado ainda." />}
    />
  );
}

export default function EquipePage() {
  const [tab, setTab] = useState<'time' | 'escala' | 'convites'>('time');
  const [editingBarber, setEditingBarber] = useState<BarberListItem | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [scheduleBarberId, setScheduleBarberId] = useState<string>('');

  const barbersQuery = useBarbersQuery();
  const invitesQuery = useStaffInvitesQuery();
  const servicesQuery = useServicesQuery({ perPage: 100, active: true });

  const barbers = barbersQuery.data ?? [];
  const pendingCount = (invitesQuery.data ?? []).filter((invite) => invite.status === 'PENDING').length;
  const scheduleBarber = barbers.find((barber) => barber.id === (scheduleBarberId || barbers[0]?.id));

  return (
    <DashboardChrome
      activeKey="equipe"
      topbarActions={
        <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setInviteOpen(true)}>
          Convidar barbeiro
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Equipe</h1>

        <Tabs
          label="Equipe"
          variant="segmented"
          value={tab}
          onChange={(value) => setTab(value as typeof tab)}
          items={[
            { value: 'time', label: 'Time', count: barbers.length },
            { value: 'escala', label: 'Escala' },
            { value: 'convites', label: 'Convites', count: pendingCount || undefined },
          ]}
        />

        {tab === 'time' && <TeamGrid barbers={barbers} onEdit={setEditingBarber} />}

        {tab === 'escala' && (
          <Card>
            <CardHeader
              title="Escala semanal"
              description="Horário, almoço e dias de folga de cada barbeiro."
              action={
                <Select
                  aria-label="Escolher barbeiro"
                  className="w-56"
                  value={scheduleBarberId || barbers[0]?.id || ''}
                  onChange={(event) => setScheduleBarberId(event.target.value)}
                  options={barbers.map((barber) => ({ value: barber.id, label: barber.name }))}
                />
              }
            />
            <div className="mt-4">
              {scheduleBarber ? (
                <WorkScheduleEditor barberId={scheduleBarber.id} schedule={scheduleBarber.workSchedule} />
              ) : (
                <p className="text-sm text-fg-muted">Cadastre um barbeiro para configurar a escala.</p>
              )}
            </div>
          </Card>
        )}

        {tab === 'convites' && <InvitesTab invites={invitesQuery.data ?? []} />}
      </div>

      <BarberModal
        open={editingBarber !== null}
        onClose={() => setEditingBarber(null)}
        barber={editingBarber}
        services={servicesQuery.data?.data ?? []}
      />
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} services={servicesQuery.data?.data ?? []} />
    </DashboardChrome>
  );
}
