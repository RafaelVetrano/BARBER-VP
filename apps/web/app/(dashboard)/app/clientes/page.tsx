'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  ResponsiveTable,
  SearchIcon,
  Skeleton,
  cn,
  useEstablishmentAuth,
  useToast,
  type MenuItem,
  type TableColumn,
} from '@barbervp/ui';
import { ClientStatus, formatBRL, formatPhone } from '@barbervp/types';
import type { ClientListCounts, ClientListItem } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { ClientDrawer } from '@/components/dashboard/clients/client-drawer';
import { NewClientModal } from '@/components/dashboard/clients/new-client-modal';
import { BulkMessageModal } from '@/components/dashboard/clients/bulk-message-modal';
import {
  CLIENT_STATUS_APPEARANCE,
  clientsErrorMessage,
  formatDate,
  whatsappLink,
} from '@/components/dashboard/clients/clients-shared';
import {
  useBulkBlockClientsMutation,
  useClientsQuery,
  useExportClientsMutation,
  useSetClientBlockedMutation,
} from '@/lib/dashboard/api/clients';

const PER_PAGE = 20;
/** Janela do debounce da busca — a filtragem é do servidor, não do array. */
const SEARCH_DEBOUNCE_MS = 350;

type ChipKey = 'todos' | ClientStatus;

const CHIPS: { key: ChipKey; label: string; countOf: (counts: ClientListCounts) => number }[] = [
  { key: 'todos', label: 'Todos', countOf: (counts) => counts.all },
  { key: ClientStatus.ATIVO, label: 'Ativos', countOf: (counts) => counts.ativo },
  { key: ClientStatus.INATIVO, label: 'Inativos 30+ dias', countOf: (counts) => counts.inativo },
  { key: ClientStatus.MENSALISTA, label: 'Mensalistas', countOf: (counts) => counts.mensalista },
  { key: ClientStatus.BLOQUEADO, label: 'Bloqueados', countOf: (counts) => counts.bloqueado },
];

/**
 * Aba Clientes (`Dashboard.dc.html` l.564–638).
 *
 * Ordem dos blocos igual à do protótipo: busca + ações, chips de filtro com
 * contagem, tabela e a barra flutuante de seleção. Busca e filtro viajam para
 * a API (`GET /clients`) — nada é filtrado sobre o array da página.
 */
export default function ClientesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { activeMembership } = useEstablishmentAuth();
  const isBarberRole = activeMembership?.role === 'BARBER';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<ChipKey>('todos');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const status = chip === 'todos' ? undefined : chip;
  const query = useClientsQuery(
    {
      search: search || undefined,
      status,
      page,
      perPage: PER_PAGE,
      sort: 'lastVisitAt',
      order: 'desc',
    },
    !isBarberRole,
  );

  const exportCsv = useExportClientsMutation();
  const bulkBlock = useBulkBlockClientsMutation();
  const setBlocked = useSetClientBlockedMutation();

  const data = query.data;
  const rows = useMemo(() => data?.data ?? [], [data]);
  const counts = data?.counts;

  const runExport = async (ids?: string[]) => {
    try {
      await exportCsv.mutateAsync({ search: search || undefined, status, ids });
      toast({ message: 'CSV gerado.', tone: 'success' });
    } catch (error) {
      toast({ message: clientsErrorMessage(error), tone: 'danger' });
    }
  };

  const runBulkBlock = async (blocked: boolean) => {
    try {
      const result = await bulkBlock.mutateAsync({ ids: selectedIds, blocked });
      toast({
        message: `${result.updated} ${result.updated === 1 ? 'cliente' : 'clientes'} ${blocked ? 'bloqueado' : 'liberado'}${result.updated === 1 ? '' : 's'}.`,
        tone: 'success',
      });
      setSelectedIds([]);
    } catch (error) {
      toast({ message: clientsErrorMessage(error), tone: 'danger' });
    }
  };

  const toggleBlockOne = async (client: ClientListItem) => {
    try {
      await setBlocked.mutateAsync({ id: client.id, blocked: !client.blocked });
      toast({
        message: client.blocked ? `${client.name} liberado.` : `${client.name} bloqueado.`,
        tone: 'success',
      });
    } catch (error) {
      toast({ message: clientsErrorMessage(error), tone: 'danger' });
    }
  };

  const goToAgenda = (client: ClientListItem) =>
    router.push(`/app/agenda?novo=1&cliente=${client.id}`);

  const columns: TableColumn<ClientListItem>[] = [
    {
      key: 'name',
      header: 'Cliente',
      mobile: 'title',
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.name} size="sm" />
          <span className="whitespace-nowrap font-medium">{row.name}</span>
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'WhatsApp',
      mobile: 'subtitle',
      render: (row) => <span className="whitespace-nowrap text-fg-muted">{formatPhone(row.phone)}</span>,
    },
    {
      key: 'lastVisit',
      header: 'Última visita',
      mobile: 'meta',
      render: (row) => <span className="whitespace-nowrap text-fg-muted">{formatDate(row.lastVisitAt)}</span>,
    },
    { key: 'visits', header: 'Visitas', align: 'right', mobile: 'meta', render: (row) => row.visitCount },
    {
      key: 'spent',
      header: 'Total gasto',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="whitespace-nowrap">{formatBRL(row.totalSpentCents)}</span>,
    },
    {
      key: 'points',
      header: 'Pontos',
      align: 'right',
      mobile: 'meta',
      // `null` = barbearia sem programa de pontos; `0` = pontuou zero.
      render: (row) => <span className="text-gold">{row.loyaltyPoints ?? '—'}</span>,
    },
    { key: 'noShow', header: 'Faltas', align: 'right', mobile: 'meta', render: (row) => row.noShowCount },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => {
        const appearance = CLIENT_STATUS_APPEARANCE[row.status];
        return <Badge tone={appearance.tone}>{appearance.label}</Badge>;
      },
    },
  ];

  const rowActions = (row: ClientListItem): MenuItem[] => [
    { label: 'Ver perfil', onSelect: () => setOpenClientId(row.id) },
    { label: 'Agendar', onSelect: () => void goToAgenda(row) },
    {
      label: 'Enviar WhatsApp',
      onSelect: () => window.open(whatsappLink(row.phone), '_blank', 'noopener,noreferrer'),
    },
    {
      label: row.blocked ? 'Desbloquear' : 'Bloquear',
      destructive: !row.blocked,
      onSelect: () => void toggleBlockOne(row),
    },
  ];

  const isFiltering = search.length > 0 || chip !== 'todos';

  /**
   * `BARBER` toma 403 em `/clients` (`SPEC.md` → RBAC) e o nav nem oferece o
   * item. Quem chega aqui digitou a URL: melhor uma tela que explica e aponta
   * para a agenda dele do que a barra de ações inteira, com botões que só
   * sabem devolver 403.
   */
  if (isBarberRole) {
    return (
      <DashboardChrome activeKey="clientes">
        <h1 className="sr-only">Clientes</h1>
        <EmptyState
          message="A base de clientes é do dono e do gerente."
          description="Sua visão é a própria agenda: lá você vê os clientes que marcaram com você."
          action={<Button onClick={() => router.push('/app/agenda')}>Ir para a agenda</Button>}
        />
      </DashboardChrome>
    );
  }

  return (
    <DashboardChrome activeKey="clientes">
      <h1 className="sr-only">Clientes</h1>

      <div className="flex flex-col gap-4">
        {/* ── Busca + ações (l.566) ────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <Input
              aria-label="Buscar cliente"
              placeholder="Buscar por nome ou telefone"
              addonLeft={<SearchIcon size={15} />}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <div className="flex gap-2.5">
            <Button variant="outline" loading={exportCsv.isPending} onClick={() => void runExport()}>
              Exportar CSV
            </Button>
            <Button onClick={() => setNewClientOpen(true)}>+ Novo cliente</Button>
          </div>
        </div>

        {/* ── Chips de filtro com contagem (l.578) ──────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((item) => {
            const active = chip === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setChip(item.key);
                  setPage(1);
                }}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-semibold transition-colors md:min-h-0 md:py-1.5',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                  active ? 'bg-gold text-bg' : 'text-fg hover:bg-surface-2',
                )}
              >
                {item.label}
                {counts && <span className="tabular-nums opacity-70">{item.countOf(counts)}</span>}
              </button>
            );
          })}
        </div>

        {/* ── Tabela (l.583) ───────────────────────────────────────────── */}
        {query.isLoading ? (
          <ClientsTableSkeleton />
        ) : query.isError ? (
          <Card>
            <EmptyState
              message="Não foi possível carregar os clientes."
              description={clientsErrorMessage(query.error)}
              action={
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Tentar de novo
                </Button>
              }
            />
          </Card>
        ) : (
          // Abaixo de `md` a tabela vira cards soltos: aninhar card dentro de
          // card empilharia duas superfícies da mesma cor.
          <div className="min-w-0 md:rounded-xl md:border md:border-border md:bg-surface-2 md:p-1">
            <ResponsiveTable
              columns={columns}
              rows={rows}
              getRowKey={(row) => row.id}
              caption="Lista de clientes da barbearia"
              onRowClick={(row) => setOpenClientId(row.id)}
              actions={rowActions}
              getActionsLabel={(row) => `Ações de ${row.name}`}
              selection={{
                selectedKeys: selectedIds,
                onToggleRow: (key) =>
                  setSelectedIds((current) =>
                    current.includes(key) ? current.filter((id) => id !== key) : [...current, key],
                  ),
                onToggleAll: () =>
                  setSelectedIds((current) => {
                    const pageIds = rows.map((row) => row.id);
                    const allOn = pageIds.length > 0 && pageIds.every((id) => current.includes(id));
                    return allOn
                      ? current.filter((id) => !pageIds.includes(id))
                      : [...new Set([...current, ...pageIds])];
                  }),
                getRowLabel: (row) => `Selecionar ${row.name}`,
                allLabel: 'Selecionar todos os clientes desta página',
              }}
              empty={
                isFiltering ? (
                  <EmptyState
                    message="Nenhum cliente com esse filtro."
                    description="Ajuste a busca ou escolha outro filtro."
                    action={
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchInput('');
                          setChip('todos');
                        }}
                      >
                        Limpar filtros
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    message="Sua base de clientes está vazia."
                    description="Clientes entram sozinhos pelo agendamento online — ou cadastre o primeiro agora."
                    action={<Button onClick={() => setNewClientOpen(true)}>+ Novo cliente</Button>}
                  />
                )
              }
            />
          </div>
        )}

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

      {/* ── Barra flutuante de seleção (l.2988) ────────────────────────── */}
      {selectedIds.length > 0 && (
        <div className="fixed inset-x-3 bottom-5 z-[150] mx-auto flex max-w-[min(680px,calc(100vw-24px))] flex-wrap items-center justify-center gap-3 rounded-xl border border-border bg-surface-3 px-4 py-3 shadow-modal">
          <span className="whitespace-nowrap text-[13px] font-semibold text-fg">
            {selectedIds.length} selecionados
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => setMessageOpen(true)}>
              Enviar mensagem
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={exportCsv.isPending}
              onClick={() => void runExport(selectedIds)}
            >
              Exportar
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={bulkBlock.isPending}
              onClick={() => void runBulkBlock(true)}
            >
              Bloquear
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={bulkBlock.isPending}
              onClick={() => void runBulkBlock(false)}
            >
              Desbloquear
            </Button>
          </div>
          <button
            type="button"
            aria-label="Limpar seleção"
            onClick={() => setSelectedIds([])}
            className="flex size-11 items-center justify-center rounded-control text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:size-8"
          >
            ✕
          </button>
        </div>
      )}

      <ClientDrawer clientId={openClientId} onClose={() => setOpenClientId(null)} />

      <NewClientModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onCreated={(client) => setOpenClientId(client.id)}
      />

      <BulkMessageModal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        ids={selectedIds}
        onSent={() => setSelectedIds([])}
      />
    </DashboardChrome>
  );
}

/** Mesma altura de linha da tabela — sem salto ao trocar o esqueleto pelos dados. */
function ClientsTableSkeleton() {
  return (
    <Card className="gap-2.5">
      <Skeleton className="h-9" />
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-12" />
      ))}
    </Card>
  );
}
