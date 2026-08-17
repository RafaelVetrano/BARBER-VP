'use client';

import {
  formatRatingBps,
  NO_PREFERENCE_BARBER,
  type PublicBarberSummary,
} from '@barbervp/types';
import { Avatar, SparkleIcon, StarIcon } from '@barbervp/ui';
import type { BookingWizardController } from './use-booking-wizard';

interface StepBarberProps {
  barbers: PublicBarberSummary[];
  wizard: BookingWizardController;
}

/** Bolinha de rádio do protótipo — anel que ganha miolo dourado quando ativa. */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'grid size-6 shrink-0 place-items-center rounded-full border-[1.5px]',
        selected ? 'border-gold' : 'border-border',
      ].join(' ')}
    >
      {selected && <span className="size-3.5 rounded-full bg-gold" />}
    </span>
  );
}

/**
 * Passo 2 — barbeiro.
 *
 * "Sem preferência" é a primeira opção e está sempre visível: é o caminho mais
 * curto para quem só quer um horário, e o servidor distribui para quem tem menos
 * atendimento no dia.
 *
 * Quem não atende a seleção aparece desabilitado COM O MOTIVO ("não realiza
 * Pigmentação"), nunca some da lista — sumir faria o cliente procurar por um
 * profissional que ele sabe que existe.
 */
export function StepBarber({ barbers, wizard }: StepBarberProps) {
  const { state, selectBarber, quote } = wizard;

  const reasons = new Map(
    (quote?.ineligibleBarbers ?? []).map((entry) => [entry.barberId, entry.reason]),
  );

  return (
    <div role="radiogroup" aria-label="Escolha o profissional" className="flex flex-col">
      <button
        type="button"
        role="radio"
        aria-checked={state.barberId === NO_PREFERENCE_BARBER}
        onClick={() => selectBarber(NO_PREFERENCE_BARBER)}
        className={[
          'flex items-center gap-3 rounded-xl border p-4 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          state.barberId === NO_PREFERENCE_BARBER
            ? 'border-gold bg-gold/10'
            : 'border-gold/60 hover:border-gold',
        ].join(' ')}
      >
        <SparkleIcon size={24} className="shrink-0 text-gold" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-fg">Sem preferência</span>
          <span className="text-[13px] text-fg-muted">Pegamos o horário mais cedo disponível</span>
        </span>
        <RadioDot selected={state.barberId === NO_PREFERENCE_BARBER} />
      </button>

      <ul className="mt-1 flex flex-col">
        {barbers.map((barber, index) => {
          const reason = reasons.get(barber.id);
          const disabled = Boolean(reason);
          const selected = state.barberId === barber.id;

          return (
            <li key={barber.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => selectBarber(barber.id)}
                className={[
                  'flex w-full items-center gap-3 py-3 text-left transition-opacity',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  index < barbers.length - 1 ? 'border-b border-border' : '',
                  disabled ? 'cursor-not-allowed opacity-40' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Avatar name={barber.name} src={barber.avatarUrl} size="lg" />

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-fg">
                      {barber.name}
                    </span>
                    {barber.ratingBps !== null && (
                      <span className="flex shrink-0 items-center gap-0.5 text-[13px] text-gold">
                        <StarIcon size={12} />
                        {formatRatingBps(barber.ratingBps)}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[13px] text-fg-muted">
                    {reason ?? barber.specialty ?? 'Atende todos os serviços'}
                  </span>
                </span>

                <RadioDot selected={selected} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
