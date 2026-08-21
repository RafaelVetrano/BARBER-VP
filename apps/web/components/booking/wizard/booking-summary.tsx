'use client';

import {
  formatDuration,
  NO_PREFERENCE_BARBER,
  type PublicBarbershop,
} from '@barbervp/types';
import { formatDateKeyLong, formatPrice } from '@/lib/booking/format';
import type { BookingWizardController, WizardStep } from './use-booking-wizard';

export interface SummaryLine {
  icon: string;
  text: string;
  /** Passo para onde o "editar" leva. */
  step?: WizardStep;
  emphasis?: boolean;
}

/**
 * As quatro linhas do resumo (serviços · profissional · data · valor).
 *
 * Sai daqui e não de dentro da tela porque o resumo aparece em dois lugares com
 * o mesmo conteúdo: o passo 4 (com "editar" em cada linha) e a tela de sucesso
 * (sem edição). Duplicar a montagem seria convidar os dois a divergirem.
 */
export function buildSummary(
  shop: PublicBarbershop,
  wizard: BookingWizardController,
): SummaryLine[] {
  const { state, quote, availability } = wizard;

  const servicesText = quote
    ? `${quote.services.map((service) => service.name).join(' + ')} · ${formatDuration(quote.totalDurationMin)}`
    : '—';

  const barberText =
    state.barberId === NO_PREFERENCE_BARBER
      ? 'Sem preferência'
      : (shop.barbers.find((barber) => barber.id === state.barberId)?.name ?? '—');

  const slot = availability?.slots.find((candidate) => candidate.startsAt === state.startsAt);
  const dateText =
    state.date && slot ? `${formatDateKeyLong(state.date)} · ${slot.time}` : '—';

  const total = quote?.totalPriceCents ?? 0;
  const covered = (quote?.coveredCents ?? 0) > 0;
  const moneyText = covered
    ? total === 0
      ? `${formatPrice(0)} · coberto pela assinatura`
      : `${formatPrice(total)} · parte coberta pela assinatura`
    : formatPrice(total);

  return [
    { icon: '✂️', text: servicesText, step: 1 },
    { icon: '👤', text: barberText, step: 2 },
    { icon: '📅', text: dateText, step: 3 },
    { icon: '💰', text: moneyText, emphasis: true },
  ];
}

interface BookingSummaryProps {
  lines: SummaryLine[];
  /** Ausente = resumo só de leitura (tela de sucesso). */
  onEdit?: (step: WizardStep) => void;
}

export function BookingSummary({ lines, onEdit }: BookingSummaryProps) {
  return (
    <ul className="flex flex-col gap-2.5 rounded-xl bg-surface-3 p-4">
      {lines.map((line) => (
        <li key={line.icon} className="flex items-start gap-2">
          <span aria-hidden="true" className="w-4 shrink-0 text-center text-base leading-6">
            {line.icon}
          </span>
          {/* Sem `truncate`: em 360px a linha da data cortaria justamente o
              horário, que é a informação que a pessoa veio conferir. */}
          <span
            className={[
              'min-w-0 flex-1 text-sm leading-6',
              line.emphasis ? 'font-semibold text-gold' : 'text-fg',
            ].join(' ')}
          >
            {line.text}
          </span>
          {onEdit && line.step && (
            <button
              type="button"
              onClick={() => onEdit(line.step!)}
              className="shrink-0 rounded text-[13px] leading-6 text-gold hover:text-gold-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              editar
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
