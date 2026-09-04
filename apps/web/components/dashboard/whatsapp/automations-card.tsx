'use client';

import { useState } from 'react';
import { LockIcon, Skeleton, Switch, useToast } from '@barbervp/ui';
import type { WhatsappAutomationItem, WhatsappEvent } from '@barbervp/types';
import { BlockError } from '@/components/dashboard/blocks';
import { useUpdateWhatsappAutomationMutation } from '@/lib/dashboard/api/whatsapp';
import {
  AUTOMATION_LABELS,
  CONTROL_AFFIX,
  formatDelayOption,
  minutesToTime,
  timeToMinutes,
} from './automation-labels';

const MINUTES_PER_DAY = 24 * 60;

/**
 * Card "Automações" — protótipo l.1659–1685.
 *
 * UMA lista dentro de um painel, com as linhas separadas por `border-bottom`;
 * não um grid de cards (era assim que estava). Cada linha traz o título, o
 * link "editar mensagem", o controle daquele evento e o interruptor.
 *
 * O tipo de controle vem do servidor (`control`/`options`), não de uma tabela
 * local: quem sabe o que `offsetMinutes` significa em cada evento é quem o
 * valida.
 */
export function AutomationsCard({
  automations,
  isLoading,
  isError,
  onRetry,
  onEdit,
  onLockedAttempt,
}: {
  automations: WhatsappAutomationItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onEdit: (event: WhatsappEvent) => void;
  /** Toggle/link de uma linha trancada — abre o upsell em vez de bater no 403. */
  onLockedAttempt: () => void;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-2 font-display text-[15px] font-semibold text-fg">Automações</h2>

      {isLoading && (
        <div className="flex flex-col">
          {/* Seis linhas na altura real — carregar não pode mexer no layout. */}
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="border-b border-border py-3.5 last:border-b-0">
              <Skeleton className="h-[46px] rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {isError && !isLoading && <BlockError label="as automações" onRetry={onRetry} />}

      {automations && !isLoading && (
        <div className="flex flex-col">
          {automations.map((automation) => (
            <AutomationRow
              key={automation.event}
              automation={automation}
              onEdit={() => onEdit(automation.event)}
              onLockedAttempt={onLockedAttempt}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AutomationRow({
  automation,
  onEdit,
  onLockedAttempt,
}: {
  automation: WhatsappAutomationItem;
  onEdit: () => void;
  onLockedAttempt: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateWhatsappAutomationMutation();
  const [error, setError] = useState<string | null>(null);

  const { locked, control } = automation;
  const affix = CONTROL_AFFIX[control];

  const save = async (dto: Parameters<typeof update.mutateAsync>[0]['dto'], done?: string) => {
    setError(null);
    try {
      await update.mutateAsync({ event: automation.event, dto });
      if (done) toast({ message: done, tone: 'success' });
    } catch {
      setError('Não foi possível salvar. Tente de novo.');
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border py-3.5 last:border-b-0 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
      <div className="flex min-w-[220px] flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
          {AUTOMATION_LABELS[automation.event]}
          {locked && (
            <LockIcon
              size={13}
              className="text-fg-muted"
              aria-label="Disponível no plano Profissional"
            />
          )}
        </span>
        <button
          type="button"
          onClick={locked ? onLockedAttempt : onEdit}
          className="flex min-h-11 w-fit items-center text-xs font-medium text-gold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:min-h-0"
        >
          editar mensagem
        </button>
        {error && (
          <span role="alert" className="text-xs text-danger">
            {error}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {control === 'DELAY_BEFORE' && (
          <ControlFrame prefix={affix.prefix} suffix={affix.suffix}>
            <RowSelect
              label={`Antecedência do ${AUTOMATION_LABELS[automation.event].toLowerCase()}`}
              disabled={locked || update.isPending}
              value={String(automation.offsetMinutes ?? '')}
              options={automation.options.map((minutes) => ({
                value: String(minutes),
                label: formatDelayOption(minutes),
              }))}
              onChange={(value) =>
                void save({ offsetMinutes: Number(value) }, 'Antecedência atualizada.')
              }
            />
          </ControlFrame>
        )}

        {control === 'INACTIVITY_DAYS' && (
          <ControlFrame prefix={affix.prefix} suffix={affix.suffix}>
            <RowSelect
              label="Janela de inatividade da reativação"
              disabled={locked || update.isPending}
              value={String(Math.round((automation.offsetMinutes ?? 0) / MINUTES_PER_DAY))}
              options={automation.options.map((days) => ({
                value: String(days),
                label: String(days),
              }))}
              onChange={(value) =>
                void save(
                  { offsetMinutes: Number(value) * MINUTES_PER_DAY },
                  'Janela de reativação atualizada.',
                )
              }
            />
          </ControlFrame>
        )}

        {control === 'TIME_OF_DAY' && (
          <ControlFrame prefix={affix.prefix} suffix={affix.suffix}>
            <input
              type="time"
              aria-label="Horário do envio de aniversário"
              disabled={locked || update.isPending}
              defaultValue={minutesToTime(automation.offsetMinutes)}
              onBlur={(event) => {
                const minutes = timeToMinutes(event.target.value);
                if (minutes === null || minutes === automation.offsetMinutes) return;
                void save({ offsetMinutes: minutes }, 'Horário de envio atualizado.');
              }}
              className="h-11 rounded-control border border-border bg-surface-2 px-2.5 text-xs font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50 md:h-[34px]"
            />
          </ControlFrame>
        )}

        {/* Linha trancada: o clique abre o upsell em vez de tentar o PATCH e
            colher um 403 — o servidor continua sendo quem decide, mas o dono
            recebe a explicação, não o erro (regra 3). */}
        {locked ? (
          <button
            type="button"
            onClick={onLockedAttempt}
            aria-label={`Ligar ${AUTOMATION_LABELS[automation.event]} — disponível no plano Profissional`}
            className="flex h-11 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:h-auto"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none flex h-6 w-11 shrink-0 items-center rounded-full bg-border opacity-50"
            >
              <span className="ml-[3px] size-[18px] rounded-full bg-fg" />
            </span>
          </button>
        ) : (
          // O alvo de toque de 44px é do PRÓPRIO `Switch` desde o agente 29 —
          // o remendo local que existia aqui (um `<label>` de 44×44 em volta)
          // saiu junto, porque `<label>` dentro de `<label>` é HTML inválido e
          // o conserto certo era no componente compartilhado.
          <Switch
            checked={automation.enabled}
            disabled={update.isPending}
            aria-label={`Ligar ${AUTOMATION_LABELS[automation.event]}`}
            onChange={(event) => void save({ enabled: event.target.checked })}
          />
        )}
      </div>
    </div>
  );
}

/** `Enviar [select] antes` — o prefixo e o sufixo mudos que emolduram o controle. */
function ControlFrame({
  prefix,
  suffix,
  children,
}: {
  prefix: string;
  suffix: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 text-[13px] font-medium text-fg-muted">
      {prefix && <span>{prefix}</span>}
      {children}
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

/**
 * `<select>` nativo compacto. Não usa o `Select` do design system porque este
 * mora DENTRO de uma frase ("Enviar __ antes") e a moldura de campo com label
 * do componente quebraria a linha.
 */
function RowSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 cursor-pointer rounded-control border border-border bg-surface-2 px-2.5 text-xs font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50 md:h-[34px]"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
