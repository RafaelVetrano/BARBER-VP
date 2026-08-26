import type { AiChatCard } from '@barbervp/types';

/**
 * Adapter da inteligência do Assistente IA ("Navalha"). Fora do escopo desta
 * fase detalhar o provedor de LLM — a interface fica pronta e configurável
 * (troca de driver = 1 binding, mesmo padrão de `NotificationAdapter`/
 * `PaymentAdapter`), sem chave real ainda.
 */
export const AI_ASSISTANT_ADAPTER = 'AI_ASSISTANT_ADAPTER';

/**
 * As consultas que o driver pode fazer ao tenant para RESPONDER COM NÚMERO —
 * a camada de "ferramentas" de um provedor real, e a razão de o driver mock
 * conseguir montar os cartões do protótipo sem hardcodar um só valor.
 *
 * É deliberadamente somente-leitura: um driver de regras não tem discernimento
 * para escrever na agenda ou no caixa da barbearia (ver `CONTEXT.md`).
 */
export interface AssistantInsightsPort {
  /** Faturamento da semana corrente + variação e série diária (cartão METRIC). */
  revenueThisWeek(): Promise<AiChatCard | null>;
  /** Clientes sem visita há `CLIENT_INACTIVE_DAYS` (cartão CLIENT_LIST). */
  inactiveClients(): Promise<AiChatCard | null>;
  /** Agendamentos de hoje (cartão AGENDA). */
  agendaToday(): Promise<AiChatCard | null>;
  /** Ticket médio do mês corrente (cartão METRIC). */
  averageTicketThisMonth(): Promise<AiChatCard | null>;
}

export interface AiAssistantReplyParams {
  tenantId: string;
  /** Histórico recente, mais antigo primeiro — contexto da conversa. */
  history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>;
  message: string;
  /** Ferramentas de leitura do tenant — ver `AssistantInsightsPort`. */
  insights: AssistantInsightsPort;
}

export interface AiAssistantReply {
  text: string;
  /** Cartão estruturado que acompanha o texto, quando a pergunta pede número. */
  card: AiChatCard | null;
}

export interface AiAssistantAdapter {
  reply(params: AiAssistantReplyParams): Promise<AiAssistantReply>;
  /**
   * Chips do rodapé (protótipo l.2967–2971). É o DRIVER que responde, porque
   * sugerir o que ele não sabe responder seria um botão morto — a regra 2 do
   * enunciado vale para o chip também.
   */
  suggestions(): string[];
}
