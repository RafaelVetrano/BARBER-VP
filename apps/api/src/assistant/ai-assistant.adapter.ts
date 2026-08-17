/**
 * Adapter da inteligência do Assistente IA ("Navalha"). Fora do escopo desta
 * fase detalhar o provedor de LLM — a interface fica pronta e configurável
 * (troca de driver = 1 binding, mesmo padrão de `NotificationAdapter`/
 * `PaymentAdapter`), sem chave real ainda.
 */
export const AI_ASSISTANT_ADAPTER = 'AI_ASSISTANT_ADAPTER';

export interface AiAssistantReplyParams {
  tenantId: string;
  /** Histórico recente, mais antigo primeiro — contexto da conversa. */
  history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>;
  message: string;
}

export interface AiAssistantAdapter {
  reply(params: AiAssistantReplyParams): Promise<string>;
}
