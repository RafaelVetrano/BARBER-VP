'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPOINTMENT_STATUS_APPEARANCE, CloseIcon, SearchIcon, SpinnerIcon, cn } from '@barbervp/ui';
import { formatBRL, formatPhone } from '@barbervp/types';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useGlobalSearchQuery } from '@/lib/dashboard/api/dashboard';

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

/**
 * Busca global da topbar (`Dashboard.dc.html`, linhas 116–122).
 *
 * O protótipo desenha o campo e o selo `Ctrl+K` mas não busca nada. Aqui:
 * `Ctrl+K`/`⌘K` foca o campo (e abre o overlay no mobile), o termo vai à API
 * com debounce, e os resultados navegam para a tela correspondente.
 *
 * Abaixo de `md` o campo não cabe ao lado do seletor de unidade e do CTA — o
 * protótipo simplesmente o esconde (`#header-search-wrap{display:none}`), o que
 * deixaria o celular sem busca nenhuma. Aqui ele vira um ícone que abre um
 * overlay de tela cheia.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [openMobile, setOpenMobile] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const debounced = useDebouncedValue(term, DEBOUNCE_MS);
  const query = useGlobalSearchQuery(debounced);

  // Ctrl+K / ⌘K — o atalho que o selo do campo promete.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (window.matchMedia('(min-width: 768px)').matches) {
          desktopInputRef.current?.focus();
          setResultsOpen(true);
        } else {
          setOpenMobile(true);
        }
      }
      if (event.key === 'Escape') {
        setResultsOpen(false);
        setOpenMobile(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Clique fora fecha o painel de resultados do desktop.
  useEffect(() => {
    if (!resultsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setResultsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [resultsOpen]);

  useEffect(() => {
    if (openMobile) mobileInputRef.current?.focus();
  }, [openMobile]);

  const go = (href: string) => {
    setResultsOpen(false);
    setOpenMobile(false);
    setTerm('');
    router.push(href);
  };

  const results = (
    <SearchResults
      term={debounced}
      loading={query.isFetching}
      data={query.data}
      onNavigate={go}
    />
  );

  return (
    <>
      {/* ── ≥ md: campo inline ─────────────────────────────────────────── */}
      <div ref={rootRef} className="relative hidden w-full max-w-[420px] md:block">
        <SearchIcon
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-3 text-fg-subtle"
        />
        <input
          ref={desktopInputRef}
          type="search"
          value={term}
          aria-label="Buscar cliente, agendamento ou serviço"
          placeholder="Buscar cliente, agendamento, serviço…"
          onChange={(event) => {
            setTerm(event.target.value);
            setResultsOpen(true);
          }}
          onFocus={() => setResultsOpen(true)}
          className={cn(
            'h-10 w-full rounded-control border border-border bg-surface pl-11 pr-[70px]',
            'text-sm text-fg placeholder:text-fg-subtle',
            'focus:border-gold focus:outline-none',
            '[&::-webkit-search-cancel-button]:appearance-none',
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-2.5 rounded-[5px] border border-border px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle"
        >
          Ctrl+K
        </span>

        {resultsOpen && term.trim().length > 0 && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-50 max-h-[70dvh] w-full overflow-y-auto rounded-xl border border-border bg-surface-3 p-1.5 shadow-menu">
            {results}
          </div>
        )}
      </div>

      {/* ── < md: ícone que abre overlay de tela cheia ─────────────────── */}
      <button
        type="button"
        aria-label="Buscar"
        onClick={() => setOpenMobile(true)}
        className="ml-auto grid size-11 shrink-0 place-items-center rounded-[9px] text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:hidden"
      >
        <SearchIcon size={18} />
      </button>

      {openMobile && (
        <div role="dialog" aria-label="Busca" className="fixed inset-0 z-50 flex flex-col bg-bg md:hidden">
          <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
            <div className="relative min-w-0 flex-1">
              <SearchIcon
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-3 text-fg-subtle"
              />
              <input
                ref={mobileInputRef}
                type="search"
                value={term}
                aria-label="Buscar cliente, agendamento ou serviço"
                placeholder="Buscar cliente, agendamento, serviço…"
                onChange={(event) => setTerm(event.target.value)}
                className="h-10 w-full rounded-control border border-border bg-surface pl-11 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:border-gold focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
              />
            </div>
            <button
              type="button"
              aria-label="Fechar busca"
              onClick={() => setOpenMobile(false)}
              className="grid size-10 shrink-0 place-items-center rounded-[9px] text-fg-muted hover:bg-surface-2"
            >
              <CloseIcon size={20} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{results}</div>
        </div>
      )}
    </>
  );
}

function SearchResults({
  term,
  loading,
  data,
  onNavigate,
}: {
  term: string;
  loading: boolean;
  data: ReturnType<typeof useGlobalSearchQuery>['data'];
  onNavigate: (href: string) => void;
}) {
  if (term.trim().length < MIN_CHARS) {
    return <p className="px-2.5 py-3 text-[13px] text-fg-muted">Digite ao menos 2 letras.</p>;
  }

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 px-2.5 py-3 text-[13px] text-fg-muted">
        <SpinnerIcon size={14} /> Buscando…
      </p>
    );
  }

  if (!data || data.total === 0) {
    return (
      <p className="px-2.5 py-3 text-[13px] text-fg-muted">
        Nada encontrado para “{term}”.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {data.clients.length > 0 && (
        <Group title="Clientes">
          {data.clients.map((client) => (
            <Row
              key={client.id}
              title={client.name}
              subtitle={formatPhone(client.phone)}
              onSelect={() => onNavigate(`/app/clientes?q=${encodeURIComponent(client.name)}`)}
            />
          ))}
        </Group>
      )}

      {data.appointments.length > 0 && (
        <Group title="Agendamentos">
          {data.appointments.map((appointment) => (
            <Row
              key={appointment.id}
              title={appointment.clientName}
              subtitle={`${appointment.serviceName} · ${appointment.barberName} · ${APPOINTMENT_STATUS_APPEARANCE[appointment.status].label}`}
              onSelect={() =>
                onNavigate(`/app/agenda?date=${appointment.startsAt.slice(0, 10)}`)
              }
            />
          ))}
        </Group>
      )}

      {data.services.length > 0 && (
        <Group title="Serviços">
          {data.services.map((service) => (
            <Row
              key={service.id}
              title={service.name}
              subtitle={`${formatBRL(service.priceCents)} · ${service.durationMin} min`}
              onSelect={() => onNavigate('/app/servicos-produtos')}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  title,
  subtitle,
  onSelect,
}: {
  title: string;
  subtitle: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <span className="truncate text-[13px] font-medium text-fg">{title}</span>
      <span className="truncate text-xs text-fg-muted">{subtitle}</span>
    </button>
  );
}
