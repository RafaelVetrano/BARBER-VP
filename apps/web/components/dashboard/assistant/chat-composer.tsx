'use client';

import { useRouter } from 'next/navigation';
import { ArrowRightIcon, MicIcon, SpinnerIcon } from '@barbervp/ui';
import { AI_MESSAGE_MAX_LENGTH, type AiChatUsage } from '@barbervp/types';
import { useSpeechInput } from './use-speech-input';

/**
 * Rodapé do chat (protótipo l.2937–2999), na ordem do original: medidor de
 * uso, banner de limite, chips de sugestão e a linha do campo.
 *
 * O link "simular limite" (l.2943) NÃO foi portado: é afordância de demo do
 * protótipo (`toggleAssistantLimit`, l.4883), como o `minhaPaginaLocked` que a
 * auditoria da Minha Página já descartou. Quem decide o limite aqui é o 403 do
 * servidor.
 */
export function ChatComposer({
  usage,
  suggestions,
  value,
  onChange,
  onSubmit,
  sending,
}: {
  usage: AiChatUsage | undefined;
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  sending: boolean;
}) {
  const router = useRouter();
  const speech = useSpeechInput((text) => onChange(value ? `${value} ${text}` : text));

  const unlimited = usage?.limit === null;
  const limitReached = usage !== undefined && usage.limit !== null && usage.used >= usage.limit;
  const percent =
    usage && usage.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  const canSend = value.trim().length > 0 && !limitReached && !sending;

  return (
    <div className="shrink-0 border-t border-border px-4 pb-5 pt-3.5 md:px-6">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
        {/* ── Medidor de uso (l.2939–2951) ───────────────────────────────── */}
        {/* Enquanto o uso não chegou não há medidor: barra vazia com rótulo em
            branco anuncia um número que ninguém mediu ainda. */}
        {usage !== undefined && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-fg-muted">
              {unlimited ? '∞ Mensagens ilimitadas' : `${usage.used}/${usage.limit} mensagens usadas`}
            </p>
            {!unlimited && (
              <div
                className="h-1 overflow-hidden rounded bg-surface-3"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Mensagens usadas no mês"
              >
                <div
                  className={`h-full rounded transition-[width] ${limitReached ? 'bg-danger' : 'bg-gold'}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Banner de limite + upgrade (l.2953–2965) ───────────────────── */}
        {limitReached && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-danger/40 bg-danger/10 px-4 py-3">
            <p className="text-[13px] font-medium text-fg">
              Você usou todas as mensagens do mês. Faça upgrade para continuar.
            </p>
            <button
              type="button"
              onClick={() => router.push('/app/configuracoes?tab=plano')}
              className="h-11 shrink-0 whitespace-nowrap rounded-lg bg-gold px-3.5 text-xs font-semibold text-bg transition-colors hover:bg-gold-hover md:h-[34px]"
            >
              Fazer upgrade
            </button>
          </div>
        )}

        {/* ── Chips de sugestão (l.2967–2971) ────────────────────────────── */}
        {suggestions.length > 0 && !limitReached && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onChange(suggestion)}
                className="h-11 shrink-0 whitespace-nowrap rounded-[20px] border border-border bg-surface px-3.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-3 md:h-auto md:py-2"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* ── Campo (l.2973–2998) ────────────────────────────────────────── */}
        <form
          className="flex items-center gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) onSubmit();
          }}
        >
          {speech.supported && (
            <button
              type="button"
              onClick={speech.toggle}
              disabled={limitReached}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? 'Parar de ditar' : 'Ditar a pergunta'}
              title={speech.listening ? 'Parar de ditar' : 'Ditar a pergunta'}
              className={`flex size-11 shrink-0 items-center justify-center rounded-control border transition-colors disabled:opacity-50 ${
                speech.listening
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-border bg-surface text-fg-muted hover:text-fg'
              }`}
            >
              <MicIcon size={18} />
            </button>
          )}

          <input
            type="text"
            value={value}
            maxLength={AI_MESSAGE_MAX_LENGTH}
            disabled={limitReached}
            onChange={(event) => onChange(event.target.value)}
            placeholder={
              limitReached
                ? 'Limite de mensagens do mês atingido'
                : 'Pergunte qualquer coisa sobre sua barbearia…'
            }
            aria-label="Pergunta para o assistente"
            className="h-11 min-w-0 flex-1 rounded-control border border-border bg-bg px-4 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-gold/60 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!canSend}
            aria-label="Enviar pergunta"
            className="flex size-11 shrink-0 items-center justify-center rounded-control bg-gold text-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
          >
            {sending ? <SpinnerIcon size={18} /> : <ArrowRightIcon size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}
