'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
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
import { formatBRL } from '@barbervp/types';
import type { OrderListCounts, OrderListItem } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { ComandaModal } from '@/components/dashboard/pos/comanda-modal';
import { ReopenOrderModal } from '@/components/dashboard/pos/reopen-order-modal';
import { formatTime, linesSummary, methodLabel } from '@/components/dashboard/pos/pos-shared';
import { useOrdersQuery } from '@/lib/dashboard/api/pos';
import { useDashboardShellQuery } from '@/lib/dashboard/api/dashboard';

const PER_PAGE = 30;
/** Mesma janela da busca da aba Clientes — a filtragem é do servidor. */
const SEARCH_DEBOUNCE_MS = 350;

type TabKey = 'abertas' | 'fechadas' | 'todas';

const TABS: { key: TabKey; label: string; countOf?: (counts: OrderListCounts) => number }[] = [
  { key: 'abertas', label: 'Abertas', countOf: (counts) => counts.abertas },
  { key: 'fechadas', label: 'Fechadas hoje', countOf: (counts) => counts.fechadasHoje },
  { key: 'todas', label: 'Todas' },
];

/**
 * Aba Comandas / POS (`Dashboard.dc.html` l.639–717).
 *
 * Ordem dos blocos igual à do protótipo: abas com contagem, busca e
 * "+ Nova comanda" na mesma linha; grid de cards das abertas; tabela das
 * fechadas. "Todas" mostra os dois blocos, como no protótipo — são dois
 * conjuntos diferentes, então são duas consultas, cada uma com sua paginação.
 */
function ComandasContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { activeMembership } = useEstablishmentAuth();
  const canReopen = activeMembership?.role === 'OWNER' || activeMembership?.role === 'MANAGER';
  // A casca já é pedida por toda tela do painel — o fuso sai de lá, e é o da
  // barbearia que manda na hora exibida (ver `formatTime`).
  const shellQuery = useDashboardShellQuery();
  const timezone = shellQuery.data?.tenant.timezone ?? 'America/Sao_Paulo';

  const [tab, setTab] = useState<TabKey>('abertas');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [openPage, setOpenPage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);
  const [canceledPage, setCanceledPage] = useState(1);

  // `?order=` abre a comanda direto — é o destino de "Abrir comanda" do menu ⋯
  // dos próximos atendimentos e do drawer da Agenda.
  const [modalOpen, setModalOpen] = useState(() => searchParams.get('order') !== null);
  const [modalOrderId, setModalOrderId] = useState<string | null>(() => searchParams.get('order'));
  const [reopenOrder, setReopenOrder] = useState<OrderListItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setOpenPage(1);
      setClosedPage(1);
      setCanceledPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const showOpen = tab === 'abertas' || tab === 'todas';
  const showClosed = tab === 'fechadas' || tab === 'todas';
  // Canceladas só em "Todas": elas não estão abertas nem foram fechadas hoje,
  // mas existiram — sumir de vez seria apagar do balcão uma comanda que o
  // operador viu na tela cinco minutos antes (agente 31).
  const showCanceled = tab === 'todas';

  const openQuery = useOrdersQuery(
    { status: 'OPEN', search, page: openPage, perPage: PER_PAGE },
    { enabled: showOpen },
  );
  const closedQuery = useOrdersQuery(
    { status: 'CLOSED', closedToday: true, search, page: closedPage, perPage: PER_PAGE },
    { enabled: showClosed },
  );
  const canceledQuery = useOrdersQuery(
    { status: 'CANCELED', search, page: canceledPage, perPage: PER_PAGE },
    { enabled: showCanceled },
  );

  // As duas consultas devolvem a MESMA contagem (ela ignora a aba de propósito);
  // vale a que já respondeu.
  const counts = openQuery.data?.counts ?? closedQuery.data?.counts;

  const openRows = openQuery.data?.data ?? [];
  const closedRows = closedQuery.data?.data ?? [];
  const canceledRows = canceledQuery.data?.data ?? [];

  const openBlock = showOpen && (openQuery.isLoading || openQuery.isError || openRows.length > 0);
  const closedBlock = showClosed && (closedQuery.isLoading || closedQuery.isError || closedRows.length > 0);
  const canceledBlock = showCanceled && canceledRows.length > 0;
  const nothingAtAll = !openBlock && !closedBlock && !canceledBlock;

  const closedColumns: TableColumn<OrderListItem>[] = [
    {
      key: 'number',
      header: 'Nº',
      mobile: 'meta',
      render: (row) => <span className="font-semibold text-gold tabular-nums">#{row.number}</span>,
    },
    {
      key: 'client',
      header: 'Cliente',
      mobile: 'title',
      render: (row) => row.clientName ?? 'Cliente avulso',
    },
    {
      key: 'barber',
      header: 'Barbeiro',
      mobile: 'subtitle',
      render: (row) => <span className="text-fg-muted">{row.barberName ?? '—'}</span>,
    },
    {
      key: 'closedAt',
      header: 'Fechada às',
      mobile: 'meta',
      render: (row) => (
        <span className="text-fg-muted tabular-nums">{row.closedAt ? formatTime(row.closedAt, timezone) : '—'}</span>
      ),
    },
    {
      key: 'payment',
      header: 'Pagamento',
      mobile: 'meta',
      render: (row) =>
        // Cortesia não é "pago em Cortesia": a comanda fechou sem cobrar, e o
        // selo com o motivo é o que o dono procura no fim do dia (agente 31).
        row.courtesyReason ? (
          <span title={row.courtesyReason}>
            <Badge tone="warning">Cortesia</Badge>
          </span>
        ) : row.paymentMethods.length === 0 ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.paymentMethods.map((method, index) => (
              <Badge key={`${method}-${index}`} tone="neutral">
                {methodLabel(method)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="font-semibold text-fg tabular-nums">{formatBRL(row.totalCents)}</span>,
    },
  ];

  /**
   * A cancelada não tem "Fechada às", pagamento nem total a mostrar — mostrar
   * R$ 0,00 numa comanda que nunca cobrou seria confundir com uma cortesia.
   * Quatro colunas, e a data em que ela morreu.
   */
  const canceledColumns: TableColumn<OrderListItem>[] = [
    {
      key: 'number',
      header: 'Nº',
      mobile: 'meta',
      render: (row) => <span className="font-semibold text-fg-muted tabular-nums">#{row.number}</span>,
    },
    {
      key: 'client',
      header: 'Cliente',
      mobile: 'title',
      render: (row) => row.clientName ?? 'Cliente avulso',
    },
    {
      key: 'barber',
      header: 'Barbeiro',
      mobile: 'subtitle',
      render: (row) => <span className="text-fg-muted">{row.barberName ?? '—'}</span>,
    },
    {
      key: 'canceledAt',
      header: 'Cancelada às',
      mobile: 'meta',
      render: (row) => (
        <span className="text-fg-muted tabular-nums">
          {row.canceledAt ? formatTime(row.canceledAt, timezone) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      mobile: 'meta',
      render: () => <Badge tone="neutral">Cancelada</Badge>,
    },
  ];

  // Reabrir é a única ação da comanda fechada — e só MANAGER+ a tem, como no
  // endpoint. Sem o papel, a linha não ganha menu nenhum.
  const closedActions: ((row: OrderListItem) => MenuItem[]) | undefined = canReopen
    ? (row) => [
        { key: 'ver', label: 'Ver comanda', onSelect: () => openComanda(row.id) },
        { key: 'reabrir', label: 'Reabrir comanda', onSelect: () => setReopenOrder(row) },
      ]
    : undefined;

  function openComanda(id: string) {
    setModalOrderId(id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setModalOrderId(null);
  }

  return (
    <DashboardChrome activeKey="comandas">
      <h1 className="sr-only">Comandas</h1>

      <div className="flex flex-col gap-5">
        {/* ── Abas + busca + nova comanda (l.641) ────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Comandas"
            className="flex gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
          >
            {TABS.map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setTab(item.key)}
                  className={cn(
                    'min-h-11 whitespace-nowrap rounded-md px-4 text-[13px] transition-colors md:min-h-[38px]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                    active ? 'bg-surface font-semibold text-fg' : 'font-medium text-fg-muted hover:text-fg',
                  )}
                >
                  {item.label}
                  {item.countOf && counts && (
                    <span className="ml-1.5 tabular-nums opacity-70">{item.countOf(counts)}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
            <div className="min-w-0 flex-1 sm:w-[260px] sm:flex-none">
              <Input
                aria-label="Buscar comanda"
                placeholder="Buscar por cliente ou nº"
                addonLeft={<SearchIcon size={15} />}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <Button
              onClick={() => {
                setModalOrderId(null);
                setModalOpen(true);
              }}
            >
              + Nova comanda
            </Button>
          </div>
        </div>

        {/* ── Comandas abertas: grid de cards (l.655) ────────────────────── */}
        {showOpen && (
          <section aria-label="Comandas abertas" className="flex flex-col gap-3">
            {tab === 'todas' && openBlock && (
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Abertas</h2>
            )}
            {openQuery.isLoading ? (
              <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                <Skeleton className="h-44 rounded-xl" />
                <Skeleton className="h-44 rounded-xl" />
                <Skeleton className="h-44 rounded-xl" />
              </div>
            ) : openQuery.isError ? (
              <BlockError label="as comandas abertas" onRetry={() => void openQuery.refetch()} />
            ) : openRows.length > 0 ? (
              <>
                <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                  {openRows.map((row) => (
                    <OpenComandaCard
                      key={row.id}
                      order={row}
                      timezone={timezone}
                      onContinue={() => openComanda(row.id)}
                    />
                  ))}
                </div>
                <Pager
                  page={openQuery.data?.meta.page ?? 1}
                  totalPages={openQuery.data?.meta.totalPages ?? 1}
                  onChange={setOpenPage}
                />
              </>
            ) : null}
          </section>
        )}

        {/* ── Comandas fechadas: tabela (l.679) ──────────────────────────── */}
        {showClosed && (
          <section aria-label="Comandas fechadas hoje" className="flex flex-col gap-3">
            {tab === 'todas' && closedBlock && (
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                Fechadas hoje
              </h2>
            )}
            {closedQuery.isLoading ? (
              <Skeleton className="h-56 rounded-xl" />
            ) : closedQuery.isError ? (
              <BlockError label="as comandas fechadas" onRetry={() => void closedQuery.refetch()} />
            ) : closedRows.length > 0 ? (
              <>
                <div className="min-w-0 md:rounded-xl md:border md:border-border md:bg-surface-2 md:p-1">
                  <ResponsiveTable
                    columns={closedColumns}
                    rows={closedRows}
                    getRowKey={(row) => row.id}
                    caption="Comandas fechadas hoje"
                    onRowClick={(row) => openComanda(row.id)}
                    actions={closedActions}
                    getActionsLabel={(row) => `Ações da comanda #${row.number}`}
                    empty={<EmptyState message="Nenhuma comanda fechada hoje." />}
                  />
                </div>
                <Pager
                  page={closedQuery.data?.meta.page ?? 1}
                  totalPages={closedQuery.data?.meta.totalPages ?? 1}
                  onChange={setClosedPage}
                />
              </>
            ) : null}
          </section>
        )}

        {/* ── Canceladas (agente 31) ──────────────────────────────────────
            Só aparece em "Todas", e só quando existe alguma: uma barbearia
            que nunca cancelou comanda não ganha uma seção vazia. */}
        {canceledBlock && (
          <section aria-label="Comandas canceladas" className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
              Canceladas
            </h2>
            <div className="min-w-0 md:rounded-xl md:border md:border-border md:bg-surface-2 md:p-1">
              <ResponsiveTable
                columns={canceledColumns}
                rows={canceledRows}
                getRowKey={(row) => row.id}
                caption="Comandas canceladas"
                onRowClick={(row) => openComanda(row.id)}
                empty={<EmptyState message="Nenhuma comanda cancelada." />}
              />
            </div>
            <Pager
              page={canceledQuery.data?.meta.page ?? 1}
              totalPages={canceledQuery.data?.meta.totalPages ?? 1}
              onChange={setCanceledPage}
            />
          </section>
        )}

        {/* ── Vazio (l.712) ──────────────────────────────────────────────── */}
        {nothingAtAll &&
          (search ? (
            <EmptyState
              message="Nenhuma comanda encontrada"
              description="Nenhuma comanda desta aba bate com a busca."
              action={
                <Button variant="outline" onClick={() => setSearchInput('')}>
                  Limpar busca
                </Button>
              }
            />
          ) : tab === 'fechadas' ? (
            <EmptyState
              message="Nenhuma comanda fechada hoje"
              description="As comandas que você fechar hoje aparecem aqui."
            />
          ) : (
            <EmptyState
              message="Nenhuma comanda aberta"
              description="Abra a primeira do dia — ou comece pela agenda, direto no atendimento."
              action={
                <Button
                  onClick={() => {
                    setModalOrderId(null);
                    setModalOpen(true);
                  }}
                >
                  + Nova comanda
                </Button>
              }
            />
          ))}
      </div>

      <ComandaModal
        open={modalOpen}
        orderId={modalOrderId}
        onClose={closeModal}
        onOrderOpened={(id) => setModalOrderId(id)}
      />

      {reopenOrder && (
        <ReopenOrderModal
          order={reopenOrder}
          onClose={() => setReopenOrder(null)}
          onReopened={(id) => {
            setReopenOrder(null);
            toast({ message: `Comanda #${reopenOrder.number} reaberta.`, tone: 'success' });
            setTab('abertas');
            openComanda(id);
          }}
        />
      )}
    </DashboardChrome>
  );
}

/** Card de comanda aberta (l.658) — o resumo dos itens e o "Continuar". */
function OpenComandaCard({
  order,
  timezone,
  onContinue,
}: {
  order: OrderListItem;
  timezone: string;
  onContinue: () => void;
}) {
  const summary = linesSummary(order.lines);
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold text-gold tabular-nums">#{order.number}</span>
        <Badge tone="success">Aberta</Badge>
      </div>

      <div>
        <p className="truncate text-sm font-semibold text-fg">{order.clientName ?? 'Cliente avulso'}</p>
        <p className="mt-0.5 text-xs text-fg-muted">
          {order.barberName ?? 'Sem barbeiro'} · aberta {formatTime(order.openedAt, timezone)}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-fg-muted">
        {summary || 'Nenhum item adicionado ainda.'}
      </p>

      <div className="mt-1 flex items-end justify-between gap-2 border-t border-border pt-2.5">
        <div>
          <p className="text-[11px] text-fg-subtle">Subtotal</p>
          <p className="font-display text-base font-bold text-fg tabular-nums">
            {formatBRL(order.subtotalCents)}
          </p>
        </div>
        <Button size="sm" onClick={onContinue}>
          Continuar
        </Button>
      </div>
    </article>
  );
}

/** Erro de UM bloco — a página segue de pé e o outro bloco continua servindo. */
function BlockError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <EmptyState
      message={`Não foi possível carregar ${label}.`}
      action={
        <Button variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      }
    />
  );
}

function Pager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-[13px] text-fg-muted">
        Página {page} de {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Próxima
      </Button>
    </div>
  );
}

/**
 * `useSearchParams()` (`?order=`) tira a rota da renderização estática: sem um
 * limite de Suspense o `next build` falha no prerender — a mesma armadilha
 * documentada em `configuracoes/page.tsx`.
 */
export default function ComandasPage() {
  return (
    <Suspense fallback={<ComandasFallback />}>
      <ComandasContent />
    </Suspense>
  );
}

function ComandasFallback() {
  return (
    <DashboardChrome activeKey="comandas">
      <Skeleton className="h-64" />
    </DashboardChrome>
  );
}
