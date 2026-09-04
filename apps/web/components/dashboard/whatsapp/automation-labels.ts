import type { WhatsappControlKind, WhatsappEvent } from '@barbervp/types';

/**
 * Rótulos da aba WhatsApp — `AUTOMACOES_DEFS` do protótipo (l.6006–6013).
 *
 * Texto de interface, não dado: é o mesmo tipo de constante que os cabeçalhos
 * das tabelas das outras abas. Tudo que a barbearia PODE MUDAR (template,
 * horário, janela, se está ligado) vem da API.
 */
export const AUTOMATION_LABELS: Record<WhatsappEvent, string> = {
  REMINDER: 'Lembrete de agendamento',
  CONFIRMATION: 'Confirmação ao criar agendamento',
  CANCELLATION: 'Aviso de cancelamento/remarcação',
  BIRTHDAY: 'Mensagem de aniversário',
  REACTIVATION: 'Reativação de inativos',
  REVIEW: 'Pedido de avaliação após atendimento',
};

/** O `prefix`/`suffix` que emoldura o controle de cada linha. */
export const CONTROL_AFFIX: Record<WhatsappControlKind, { prefix: string; suffix: string }> = {
  NONE: { prefix: '', suffix: '' },
  DELAY_BEFORE: { prefix: 'Enviar', suffix: 'antes' },
  TIME_OF_DAY: { prefix: 'às', suffix: '' },
  INACTIVITY_DAYS: { prefix: 'Após', suffix: 'dias' },
};

/** `60 → "1h"`, `1440 → "24h"` — o rótulo das opções do lembrete (l.6007). */
export function formatDelayOption(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}min`;
}

/** Minutos desde a meia-noite → `HH:MM`, o valor do `<input type="time">`. */
export function minutesToTime(minutes: number | null): string {
  const safe = Math.max(0, Math.min(minutes ?? 0, 24 * 60 - 1));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** `HH:MM` → minutos desde a meia-noite. `null` quando o campo está vazio. */
export function timeToMinutes(value: string): number | null {
  const [hours, minutes] = value.split(':').map(Number);
  if (hours === undefined || minutes === undefined) return null;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Benefícios do upsell — os bullets do `openUpgradeModal` desta aba
 * (protótipo l.6033 e l.6096).
 */
export const WHATSAPP_UPGRADE_BENEFITS = [
  'Aniversário, reativação e avaliação automáticos',
  'Aumente o retorno de clientes inativos',
  'Mensagens 100% personalizáveis',
];

export const WHATSAPP_UPGRADE_DESCRIPTION =
  'Aniversário, reativação e pedido de avaliação fazem parte do WhatsApp completo. Lembrete, confirmação e aviso de cancelamento continuam liberados no seu plano.';

/** Plano mínimo com `whatsappCompleto` (`FEATURE_TIER`, protótipo l.4363). */
export const WHATSAPP_MIN_PLAN_LABEL = 'Profissional';
