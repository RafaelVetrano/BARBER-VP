'use client';

import type { ClientAppointmentItem } from '@barbervp/types';
import { AppointmentStatus } from '@barbervp/types';
import { Avatar, AppointmentStatusPill, Button, StarIcon } from '@barbervp/ui';
import { formatPrice } from '@/lib/booking/format';

/** `2026-08-19T12:00:00Z` + fuso → "Qui, 19 de agosto". */
function formatDateLabel(iso: string, timezone: string): string {
  const date = new Date(iso);
  const raw = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    timeZone: timezone,
  }).format(date);
  // "qui., 19 de agosto" → "Qui, 19 de agosto".
  const [weekday, ...rest] = raw.replace('.', '').split(', ');
  return `${capitalize(weekday!)}, ${rest.join(', ')}`;
}

function formatTimeLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function serviceLabel(item: ClientAppointmentItem): string {
  return item.services.map((service) => service.name).join(' + ');
}

// ── Próximos ─────────────────────────────────────────────────────────────────

export function UpcomingAppointmentCard({
  item,
  onReschedule,
  onCancel,
}: {
  item: ClientAppointmentItem;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-semibold text-fg">{formatDateLabel(item.startsAt, item.timezone)}</span>
          <span className="text-sm text-fg-muted">{formatTimeLabel(item.startsAt, item.timezone)}</span>
        </div>
        <AppointmentStatusPill status={item.status} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-fg">{serviceLabel(item)}</span>
        <span className="shrink-0 text-[15px] font-semibold text-gold">
          {item.coveredBySubscription ? 'Incluído' : formatPrice(item.totalPriceCents)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Avatar name={item.barber.name} src={item.barber.avatarUrl} size="sm" className="size-7" />
        <span className="text-[13px] text-fg-muted">{item.barber.name}</span>
      </div>

      {item.cancelable ? (
        <div className="mt-0.5 flex gap-2">
          <Button variant="outline" size="sm" fullWidth onClick={onReschedule}>
            Remarcar
          </Button>
          <Button variant="ghost" size="sm" fullWidth onClick={onCancel} className="text-danger">
            Cancelar
          </Button>
        </div>
      ) : (
        <p className="text-xs text-fg-subtle">
          Fora da janela de {item.cancelWindowHours}h para alterar — fale com a barbearia pelo WhatsApp.
        </p>
      )}
    </div>
  );
}

// ── Histórico ────────────────────────────────────────────────────────────────

function Stars({
  rating,
  onRate,
}: {
  rating: number;
  onRate?: (value: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          disabled={!onRate}
          aria-label={onRate ? `Avaliar com ${value} estrela(s)` : undefined}
          onClick={() => onRate?.(value)}
          className={onRate ? 'cursor-pointer' : 'cursor-default'}
        >
          <StarIcon size={18} className={value <= rating ? 'text-gold' : 'text-border'} />
        </button>
      ))}
    </div>
  );
}

export function HistoryAppointmentCard({
  item,
  onBookAgain,
  onRate,
  rating,
}: {
  item: ClientAppointmentItem;
  onBookAgain: (serviceId: string) => void;
  onRate: (rating: number) => void;
  /** `'saving'` enquanto a avaliação está sendo enviada — trava as estrelas. */
  rating: 'idle' | 'saving';
}) {
  const isDone = item.status === AppointmentStatus.DONE;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-3 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-fg">
          {formatDateLabel(item.startsAt, item.timezone).replace(/^(\w+), /, '$1 ')} · {serviceLabel(item)}
        </span>
        <AppointmentStatusPill status={item.status} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-fg-muted">{item.barber.name}</span>
        <span className="shrink-0 text-sm font-semibold text-gold">
          {item.coveredBySubscription ? 'Incluído' : formatPrice(item.totalPriceCents)}
        </span>
      </div>

      {isDone && (
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => onBookAgain(item.services[0]?.id ?? '')}
        >
          Agendar de novo
        </Button>
      )}

      {isDone && !item.review && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[13px] text-fg-muted">Avaliar atendimento</span>
          <Stars rating={0} onRate={rating === 'saving' ? undefined : (value) => onRate(value)} />
        </div>
      )}

      {isDone && item.review && (
        <div className="mt-1 flex items-center gap-2">
          <Stars rating={item.review.rating} />
          {item.review.comment && <span className="truncate text-xs text-fg-muted">“{item.review.comment}”</span>}
        </div>
      )}
    </div>
  );
}
