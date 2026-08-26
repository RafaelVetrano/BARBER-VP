import { ApiError, type BadgeTone } from '@barbervp/ui';
import { ClientStatus, SubscriptionStatus } from '@barbervp/types';

/**
 * Rótulo e cor de cada status (`Dashboard.dc.html` l.4934 — `STATUS_COLORS`).
 *
 * Os hex do protótipo são exatamente os tokens do design system: `#3FB68B` é
 * `success`, `#9AA1AC` é `fg-muted`, `#D4A84C` é `gold`, `#E05B5B` é `danger`.
 * Por isso o mapa guarda o TOM, nunca a cor literal.
 */
export const CLIENT_STATUS_APPEARANCE: Record<ClientStatus, { label: string; tone: BadgeTone }> = {
  [ClientStatus.ATIVO]: { label: 'Ativo', tone: 'success' },
  [ClientStatus.INATIVO]: { label: 'Inativo', tone: 'neutral' },
  [ClientStatus.MENSALISTA]: { label: 'Mensalista', tone: 'gold' },
  [ClientStatus.BLOQUEADO]: { label: 'Bloqueado', tone: 'danger' },
};

/** Selo de cobrança da aba Assinatura (l.3059). */
export const SUBSCRIPTION_STATUS_APPEARANCE: Record<
  SubscriptionStatus,
  { label: string; tone: BadgeTone }
> = {
  [SubscriptionStatus.ACTIVE]: { label: 'Cobrança em dia', tone: 'success' },
  [SubscriptionStatus.PAST_DUE]: { label: 'Cobrança atrasada', tone: 'danger' },
  [SubscriptionStatus.PAUSED]: { label: 'Assinatura pausada', tone: 'warning' },
  [SubscriptionStatus.CANCELED]: { label: 'Assinatura cancelada', tone: 'neutral' },
};

/** `2026-08-21T…` → `21/08/2026`. `null` vira o travessão do protótipo. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(iso),
  );
}

/** `21/08` — a data curta do histórico e do extrato de pontos. */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(iso));
}

/**
 * Aniversário a partir de `YYYY-MM-DD`.
 *
 * Formatado à mão, sem `Date`: `new Date('1990-05-12')` é meia-noite UTC e
 * volta um dia em qualquer fuso a oeste — o cliente faria aniversário no dia 11.
 */
export function formatBirthday(birthDate: string | null): string | null {
  const [, month, day] = birthDate?.split('-') ?? [];
  return month && day ? `${day}/${month}` : null;
}

/**
 * Link de conversa do WhatsApp. `phone` já vem em E.164 sem formatação, que é
 * exatamente o que o `wa.me` espera.
 */
export function whatsappLink(phone: string, text?: string): string {
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${phone.replace(/\D/g, '')}${query}`;
}

export function clientsErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Não foi possível concluir a ação.';
}
