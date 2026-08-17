/**
 * Assistente IA ("Navalha") — fase 07.
 *
 * A inteligência em si é um adapter próprio (`AiAssistantAdapter`), fora de
 * escopo detalhar o provedor de LLM nesta fase — aqui só a interface de chat
 * e o limite de mensagens por mês conforme o plano.
 */

export const AI_MESSAGE_ROLES = ['USER', 'ASSISTANT'] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

/** Limite de mensagens do usuário por mês, por tier do plano. `null` = ilimitado. */
export const AI_MESSAGE_LIMIT_BY_TIER: Record<number, number | null> = {
  0: 50, // Essencial
  1: 200, // Profissional
  2: null, // Avançado
};

export interface AiChatMessageItem {
  id: string;
  role: AiMessageRole;
  content: string;
  createdAt: string;
}

export interface SendAiChatMessageDto {
  content: string;
}

export interface AiChatUsage {
  used: number;
  limit: number | null;
}

export interface AiChatResponse {
  message: AiChatMessageItem;
  usage: AiChatUsage;
}

export interface AiChatHistoryResponse {
  messages: AiChatMessageItem[];
  usage: AiChatUsage;
}
