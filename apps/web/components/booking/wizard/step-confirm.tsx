'use client';

import { formatPhone, type PublicBarbershop } from '@barbervp/types';
import { Avatar, Button, Input, Switch, Textarea, maskPhoneInput } from '@barbervp/ui';
import { BookingSummary, buildSummary } from './booking-summary';
import type { BookingWizardController, WizardStep } from './use-booking-wizard';

interface StepConfirmProps {
  shop: PublicBarbershop;
  wizard: BookingWizardController;
  onEdit: (step: WizardStep) => void;
  onRequestLogin: () => void;
  onRequestRegister: () => void;
  /** Erros de validação, mostrados só depois da primeira tentativa de envio. */
  showErrors: boolean;
}

/**
 * Passo 4 — confirmação.
 *
 * Duas caras, como no protótipo: cliente logado vê o cartão da conta; visitante
 * vê nome + WhatsApp e o convite discreto para entrar ou criar conta. O
 * visitante NÃO é obrigado a se cadastrar — a fricção mata o agendamento de 30
 * segundos, que é a razão de o link existir. A verificação por código só
 * aparece quando o backend detecta risco, e aí o wizard mostra o campo do OTP.
 */
export function StepConfirm({
  shop,
  wizard,
  onEdit,
  onRequestLogin,
  onRequestRegister,
  showErrors,
}: StepConfirmProps) {
  const { state, patch, client } = wizard;

  const nameError =
    showErrors && state.guestName.trim().length < 2 ? 'Informe seu nome' : undefined;
  const phoneError =
    showErrors && state.guestPhone.replace(/\D/g, '').length < 10
      ? 'Número incompleto'
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <BookingSummary lines={buildSummary(shop, wizard)} onEdit={onEdit} />

      {client ? (
        <div className="flex items-center gap-3 rounded-xl bg-surface-3 p-3.5">
          <Avatar name={client.name} size="md" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-fg">{client.name}</span>
            <span className="flex items-center gap-1 text-[13px] text-fg-muted">
              {client.phoneVerified && <span className="text-success">✓</span>}
              <span className="truncate">{formatPhone(client.phone)}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onRequestLogin}
            className="shrink-0 rounded text-[13px] text-gold hover:text-gold-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            trocar conta
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 rounded-xl border border-border p-3.5">
            <p className="text-sm text-fg">
              Já é cliente?{' '}
              <button
                type="button"
                onClick={onRequestLogin}
                className="rounded font-semibold text-gold hover:text-gold-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                Entrar
              </button>
            </p>
            <Button variant="outline" size="sm" fullWidth onClick={onRequestRegister}>
              Criar conta
            </Button>
          </div>

          <p className="text-[13px] font-semibold text-fg-muted">Ou continue como visitante</p>

          <Input
            label="Nome completo"
            required
            autoComplete="name"
            placeholder="Seu nome"
            value={state.guestName}
            error={nameError}
            onChange={(event) => patch({ guestName: event.target.value })}
          />

          <Input
            label="WhatsApp"
            required
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(16) 9 9999-9999"
            value={state.guestPhone}
            error={phoneError}
            hint="É por aqui que a confirmação e o lembrete chegam."
            onChange={(event) => patch({ guestPhone: maskPhoneInput(event.target.value) })}
          />

          <Switch
            label="Lembrar meus dados neste aparelho"
            checked={state.rememberMe}
            onChange={(event) => patch({ rememberMe: event.target.checked })}
          />
        </>
      )}

      <Textarea
        label="Observações (opcional)"
        rows={3}
        maxLength={500}
        placeholder="Ex: máquina 2 na lateral"
        value={state.notes}
        onChange={(event) => patch({ notes: event.target.value })}
      />

      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-fg-muted">
        <span aria-hidden="true">💬</span>
        <span>
          Você recebe a confirmação e um lembrete no WhatsApp. Dá para cancelar ou remarcar até{' '}
          {shop.policy.cancelWindowHours}h antes do horário.
        </span>
      </p>
    </div>
  );
}
