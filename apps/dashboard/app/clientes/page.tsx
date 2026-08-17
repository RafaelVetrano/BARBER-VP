'use client';

import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Input,
  ResponsiveTable,
  SearchIcon,
  Select,
  Textarea,
  useToast,
  type TableColumn,
} from '@barbervp/ui';
import { formatBRL, formatPhone } from '@barbervp/types';
import type { ClientListItem } from '@barbervp/types';
import { DashboardChrome } from '../../components/dashboard-chrome';
import { useBarbersQuery } from '../../lib/api/team';
import { useClientsQuery, useSetClientBlockedMutation, useUpdateClientMutation } from '../../lib/api/clients';

function ClientDrawer({ client, onClose }: { client: ClientListItem | null; onClose: () => void }) {
  const { toast } = useToast();
  const barbersQuery = useBarbersQuery();
  const update = useUpdateClientMutation();
  const setBlocked = useSetClientBlockedMutation();

  const [notes, setNotes] = useState(client?.notes ?? '');
  const [favoriteBarberId, setFavoriteBarberId] = useState(client?.favoriteBarberId ?? '');

  // Sincroniza o formulário sempre que um cliente diferente é aberto — sem
  // `useEffect`: derivar durante a renderização evita o "flash" do form
  // antigo antes do efeito rodar.
  const [openedId, setOpenedId] = useState<string | null>(null);
  if (client && client.id !== openedId) {
    setOpenedId(client.id);
    setNotes(client.notes ?? '');
    setFavoriteBarberId(client.favoriteBarberId ?? '');
  }

  const save = async () => {
    if (!client) return;
    try {
      await update.mutateAsync({
        id: client.id,
        dto: { notes: notes || null, favoriteBarberId: favoriteBarberId || null },
      });
      toast({ message: 'Cliente atualizado.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  const toggleBlock = async () => {
    if (!client) return;
    try {
      await setBlocked.mutateAsync({ id: client.id, blocked: !client.blocked });
      toast({ message: client.blocked ? 'Cliente liberado.' : 'Cliente bloqueado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível concluir.', tone: 'danger' });
    }
  };

  return (
    <Drawer open={client !== null} onClose={onClose} title={client?.name ?? ''}>
      {client && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Avatar name={client.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-fg">{client.name}</p>
              <p className="text-sm text-fg-muted">{formatPhone(client.phone)}</p>
              {client.email && <p className="truncate text-xs text-fg-subtle">{client.email}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg-muted">Visitas</p>
              <p className="text-lg font-bold text-fg">{client.visitCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg-muted">Total gasto</p>
              <p className="text-lg font-bold text-fg">{formatBRL(client.totalSpentCents)}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg-muted">Faltas</p>
              <p className="text-lg font-bold text-fg">{client.noShowCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-xs text-fg-muted">Status</p>
              <Badge tone={client.blocked ? 'danger' : 'success'}>
                {client.blocked ? 'Bloqueado' : 'Ativo'}
              </Badge>
            </div>
          </div>

          <Select
            label="Barbeiro favorito"
            value={favoriteBarberId}
            onChange={(event) => setFavoriteBarberId(event.target.value)}
            placeholder="Nenhum"
            options={(barbersQuery.data ?? []).map((barber) => ({ value: barber.id, label: barber.name }))}
          />

          <Textarea
            label="Notas"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Preferências, observações do atendimento…"
          />

          <div className="flex gap-2">
            <Button fullWidth loading={update.isPending} onClick={() => void save()}>
              Salvar
            </Button>
            <Button
              fullWidth
              variant={client.blocked ? 'outline' : 'danger'}
              loading={setBlocked.isPending}
              onClick={() => void toggleBlock()}
            >
              {client.blocked ? 'Liberar agendamento' : 'Bloquear agendamento'}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export default function ClientesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ClientListItem | null>(null);

  const query = useClientsQuery({ search: search || undefined, page, perPage: 20, sort: 'lastVisitAt', order: 'desc' });
  const data = query.data;

  const columns: TableColumn<ClientListItem>[] = [
    { key: 'name', header: 'Cliente', mobile: 'title', render: (row) => row.name },
    { key: 'phone', header: 'Telefone', mobile: 'subtitle', render: (row) => formatPhone(row.phone) },
    {
      key: 'favorite',
      header: 'Barbeiro favorito',
      mobile: 'meta',
      render: (row) => row.favoriteBarberName ?? '—',
    },
    { key: 'visits', header: 'Visitas', align: 'right', mobile: 'meta', render: (row) => row.visitCount },
    {
      key: 'spent',
      header: 'Total gasto',
      align: 'right',
      mobile: 'meta',
      render: (row) => formatBRL(row.totalSpentCents),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => (row.blocked ? <Badge tone="danger">Bloqueado</Badge> : <Badge tone="success">Ativo</Badge>),
    },
  ];

  return (
    <DashboardChrome activeKey="clientes">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold text-fg">Clientes</h1>
          <div className="w-full sm:w-72">
            <Input
              aria-label="Buscar cliente"
              placeholder="Nome, telefone ou e-mail"
              addonLeft={<SearchIcon size={16} />}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <ResponsiveTable
          columns={columns}
          rows={data?.data ?? []}
          getRowKey={(row) => row.id}
          caption="Lista de clientes"
          onRowClick={(row) => setSelected(row)}
          empty={
            <EmptyState
              message="Nenhum cliente encontrado."
              description="Clientes aparecem aqui a partir do primeiro agendamento (online ou pelo staff)."
            />
          }
        />

        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-[13px] text-fg-muted">
              Página {data.meta.page} de {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        )}
      </div>

      <ClientDrawer client={selected} onClose={() => setSelected(null)} />
    </DashboardChrome>
  );
}
