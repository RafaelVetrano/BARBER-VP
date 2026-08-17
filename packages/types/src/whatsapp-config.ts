/** Automações de WhatsApp — fase 07. Nome de arquivo evita colisão com `booking.ts` (que já usa "whatsapp" para outra coisa). */

import type { WhatsappEvent } from './enums';

export interface WhatsappAutomationItem {
  event: WhatsappEvent;
  enabled: boolean;
  template: string;
  offsetMinutes: number | null;
  /** Eventos além do básico (aniversário/reativação/avaliação) — atrás de `whatsappCompleto`. */
  requiresFullFeature: boolean;
}

export interface UpdateWhatsappAutomationDto {
  enabled?: boolean;
  template?: string;
  offsetMinutes?: number | null;
}

/** Eventos que fazem parte do básico, liberado em todo plano. */
export const WHATSAPP_BASIC_EVENTS: readonly WhatsappEvent[] = ['REMINDER', 'CONFIRMATION', 'CANCELLATION'];
