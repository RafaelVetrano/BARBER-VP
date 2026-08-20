'use client';

import { useId } from 'react';
import { formatDuration, type PublicServiceSummary } from '@barbervp/types';
import { Checkbox } from '@barbervp/ui';
import { formatPrice } from '@/lib/booking/format';
import type { BookingWizardController } from './use-booking-wizard';

interface StepServicesProps {
  services: PublicServiceSummary[];
  wizard: BookingWizardController;
}

/**
 * Passo 1 — serviços.
 *
 * Seleção múltipla por checkbox, como no protótipo. O combo NÃO é aplicado
 * aqui: o cliente marca "Corte Masculino" e "Barba", e é o servidor que
 * responde com "Corte + Barba" na cotação. Os dois seguem marcados na lista
 * enquanto o rodapé já mostra o preço do combo — a marcação é o que a pessoa
 * pediu, o resumo é o que ela vai pagar.
 *
 * Combos ficam fora da lista: oferecê-los como uma linha a mais deixaria marcar
 * "Corte", "Barba" e "Corte + Barba" ao mesmo tempo.
 */
export function StepServices({ services, wizard }: StepServicesProps) {
  const { state, toggleService, quote } = wizard;
  const idPrefix = useId();

  const quoted = new Map((quote?.services ?? []).map((service) => [service.serviceId, service]));
  const selectable = services.filter((service) => !service.isCombo);

  return (
    <ul className="flex flex-col">
      {selectable.map((service, index) => {
        const inputId = `${idPrefix}-${service.id}`;
        const checked = state.serviceIds.includes(service.id);
        const line = quoted.get(service.id);
        const covered = line?.coveredBySubscription ?? false;
        const exhausted = line?.subscriptionExhausted ?? false;
        const unavailable = service.barberIds.length === 0;

        return (
          <li
            key={service.id}
            className={index < selectable.length - 1 ? 'border-b border-border' : undefined}
          >
            {/*
              O rótulo envolve a LINHA INTEIRA (caixa, texto e preço), com
              associação implícita — sem `htmlFor`, que somado ao aninhamento
              dispararia o clique duas vezes. Assim o alvo de toque tem os 64px
              da linha e não os 24px da caixinha, que é o mínimo de toque da
              regra 1 sendo respeitado onde ele importa: numa lista que se marca
              com o polegar.
            */}
            <label
              className={[
                'flex min-h-16 items-center gap-3 py-2 select-none',
                unavailable ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
              ].join(' ')}
            >
              <Checkbox
                id={inputId}
                checked={checked}
                disabled={unavailable}
                onChange={() => toggleService(service.id)}
              />

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[15px] font-medium text-fg">{service.name}</span>
                  {covered && (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold">
                      Incluído na assinatura
                    </span>
                  )}
                </span>

                <span className="text-[13px] text-fg-muted">
                  {formatDuration(service.durationMin)}
                </span>

                {exhausted && (
                  <span className="text-xs text-fg-muted">
                    Usos do ciclo esgotados — este sai cobrado
                  </span>
                )}
                {unavailable && (
                  <span className="text-xs text-fg-muted">
                    Nenhum profissional disponível para este serviço
                  </span>
                )}
              </span>

              <span
                className={[
                  'shrink-0 text-[15px] font-semibold',
                  covered ? 'text-gold' : 'text-fg',
                ].join(' ')}
              >
                {covered ? 'Incluído' : formatPrice(service.priceCents)}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
