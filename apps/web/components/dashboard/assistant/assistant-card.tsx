'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarIcon, ChatIcon } from '@barbervp/ui';
import { formatBRL, type AiChatCard } from '@barbervp/types';
import { Sparkline } from './sparkline';

/**
 * Os cartões que acompanham a resposta do Navalha (protótipo l.2840–2934).
 *
 * Todos herdam a MESMA moldura do original: caixa `surface` com borda, raio 12
 * e largura de conteúdo com piso próprio (220/280/320px no protótipo).
 *
 * Todo botão daqui NAVEGA para a aba dona da ação (regra 2 do enunciado): o
 * assistente não reimplementa o envio em massa nem a agenda, ele leva até elas
 * — inclusive porque é lá que moram o gate de plano e a confirmação.
 */
export function AssistantCard({ card }: { card: AiChatCard }) {
  switch (card.kind) {
    case 'METRIC':
      return <MetricCard card={card} />;
    case 'CLIENT_LIST':
      return <ClientListCard card={card} />;
    case 'AGENDA':
      return <AgendaCard card={card} />;
  }
}

function Shell({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  return (
    <div
      className="flex w-fit max-w-full flex-col gap-3 rounded-xl border border-border bg-surface p-4"
      style={{ minWidth: `min(${minWidth}px, 100%)` }}
    >
      {children}
    </div>
  );
}

/** Botão secundário do cartão — 32px de altura no protótipo, alvo de toque
 *  elevado para 44px abaixo de `md` (regra 6). */
function CardButton({
  children,
  onClick,
  variant = 'outline',
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'gold' | 'outline' | 'ghost';
}) {
  const look =
    variant === 'gold'
      ? 'bg-gold text-bg hover:bg-gold-hover'
      : variant === 'outline'
        ? 'border border-border text-fg hover:bg-surface-3'
        : 'text-fg-muted hover:text-fg';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 items-center rounded-lg px-3.5 text-xs font-semibold transition-colors md:h-8 md:px-3 ${look}`}
    >
      {children}
    </button>
  );
}

/** Número grande + variação + sparkline (l.2847–2850). */
function MetricCard({ card }: { card: Extract<AiChatCard, { kind: 'METRIC' }> }) {
  const positive = (card.deltaPercent ?? 0) >= 0;
  return (
    <Shell minWidth={220}>
      <p className="text-xs text-fg-muted">{card.label}</p>
      <p className="font-display text-xl font-bold tabular-nums text-fg">
        {formatBRL(card.valueCents)}{' '}
        <span className={`text-xs font-semibold ${positive ? 'text-success' : 'text-danger'}`}>
          {card.deltaPercent === null
            ? card.deltaLabel
            : `${positive ? '▲' : '▼'} ${Math.abs(card.deltaPercent)}% ${card.deltaLabel}`}
        </span>
      </p>
      <Sparkline series={card.series} />
    </Shell>
  );
}

/** Lista de clientes sumidos + ação em massa (l.2915–2931). */
function ClientListCard({ card }: { card: Extract<AiChatCard, { kind: 'CLIENT_LIST' }> }) {
  const router = useRouter();
  const rest = card.total - card.clients.length;

  return (
    <Shell minWidth={320}>
      <p className="text-[13px] leading-relaxed text-fg">{card.title}</p>
      <ul className="flex flex-col">
        {card.clients.map((client) => (
          <li
            key={client.clientProfileId}
            className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
          >
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full border border-border bg-bg text-[10px] font-semibold text-fg">
              {client.initials}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{client.name}</span>
            <span className="shrink-0 text-xs text-fg-muted">última visita {client.lastVisitLabel}</span>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="text-xs text-fg-muted">e mais {rest} — a lista completa está na aba Clientes.</p>
      )}
      {card.action === 'REACTIVATION' && card.actionLabel && (
        <CardButton variant="gold" onClick={() => router.push('/app/whatsapp')}>
          <ChatIcon size={14} className="mr-1.5" />
          {card.actionLabel}
        </CardButton>
      )}
    </Shell>
  );
}

/** Recorte da agenda (l.2862–2880). */
function AgendaCard({ card }: { card: Extract<AiChatCard, { kind: 'AGENDA' }> }) {
  const router = useRouter();
  const rest = card.total - card.appointments.length;

  return (
    <Shell minWidth={280}>
      <div className="flex items-center gap-2">
        <CalendarIcon size={18} className="shrink-0 text-success" />
        <span className="text-sm font-semibold text-fg">{card.title}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {card.appointments.map((appointment) => (
          <li key={appointment.appointmentId} className="flex flex-col gap-0.5">
            <span className="text-[13px] text-fg-muted">
              {appointment.clientName} · {appointment.serviceName}
            </span>
            <span className="text-[13px] text-fg-muted">
              Com {appointment.barberName} · {appointment.whenLabel}
            </span>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="text-xs text-fg-muted">e mais {rest} na agenda do dia.</p>}
      <div className="flex flex-wrap gap-2">
        <CardButton onClick={() => router.push(`/app/agenda?date=${card.date}`)}>Ver na agenda</CardButton>
      </div>
    </Shell>
  );
}
