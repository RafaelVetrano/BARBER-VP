/**
 * Assistente IA ("Navalha") — fase 07, auditado pelo agente 28.
 *
 * A inteligência em si é um adapter próprio (`AiAssistantAdapter`), fora de
 * escopo detalhar o provedor de LLM nesta fase. O que MORA aqui é o contrato
 * da interface de chat: mensagens, os cartões estruturados que o protótipo
 * desenha ao lado das respostas, a cota mensal por plano e as sugestões.
 */

export const AI_MESSAGE_ROLES = ['USER', 'ASSISTANT'] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

/** Limite de mensagens do usuário por mês, por tier do plano. `null` = ilimitado. */
export const AI_MESSAGE_LIMIT_BY_TIER: Record<number, number | null> = {
  0: 50, // Essencial
  1: 200, // Profissional
  2: null, // Avançado
};

/** Tamanho máximo de uma pergunta — espelha o DTO do backend. */
export const AI_MESSAGE_MAX_LENGTH = 2_000;

// ─────────────────────────────────────────────────── Cartões da resposta ────

/**
 * O protótipo (l.2840–2934) não responde só com texto: junto do balão vem um
 * cartão estruturado — o número da semana com sparkline, a lista de clientes
 * sumidos, o recorte da agenda. Cada um é um bloco com geometria própria, e
 * por isso é um TIPO, não markdown solto dentro do texto.
 *
 * Todo valor sai de consulta real ao tenant (`AssistantInsightsService`);
 * o driver escolhe QUAL cartão, nunca o conteúdo dele.
 */

/** Ponto da sparkline — só o valor, o eixo é a ordem do array. */
export interface AiChatMetricPoint {
  label: string;
  valueCents: number;
}

/** Número grande + variação + sparkline (protótipo l.2847–2850). */
export interface AiChatMetricCard {
  kind: 'METRIC';
  label: string;
  valueCents: number;
  /** Variação percentual contra o período anterior. `null` = sem base de comparação. */
  deltaPercent: number | null;
  deltaLabel: string;
  series: AiChatMetricPoint[];
}

/** Uma linha da lista de clientes do cartão (protótipo l.2921–2927). */
export interface AiChatClientRow {
  clientProfileId: string;
  name: string;
  initials: string;
  /** Já formatado pelo servidor no fuso do tenant — `dd/MM`. */
  lastVisitLabel: string;
}

/**
 * Lista de clientes + ação em massa (protótipo l.2915–2931). `action`
 * diz para onde o botão leva; o texto do botão vem em `actionLabel`.
 */
export interface AiChatClientListCard {
  kind: 'CLIENT_LIST';
  title: string;
  clients: AiChatClientRow[];
  /** Total do recorte — a lista traz só as primeiras linhas. */
  total: number;
  action: 'REACTIVATION' | null;
  actionLabel: string | null;
}

/** Uma linha de agendamento dentro do cartão de agenda. */
export interface AiChatAppointmentRow {
  appointmentId: string;
  clientName: string;
  serviceName: string;
  barberName: string;
  /** `dd/MM às HH:mm`, já no fuso do tenant. */
  whenLabel: string;
  /** `YYYY-MM-DD` — o destino do "Ver na agenda". */
  date: string;
}

/**
 * Recorte da agenda (protótipo l.2862–2880: ícone, título, linhas de detalhe
 * e os botões de ação). O cartão de "Agendamento criado" do protótipo é ESTA
 * mesma geometria com uma linha só — ver a nota de dívida no `CONTEXT.md`.
 */
export interface AiChatAgendaCard {
  kind: 'AGENDA';
  title: string;
  appointments: AiChatAppointmentRow[];
  total: number;
  /** Dia que o "Ver na agenda" abre quando o cartão resume o dia inteiro. */
  date: string;
}

export type AiChatCard = AiChatMetricCard | AiChatClientListCard | AiChatAgendaCard;

export const AI_CHAT_CARD_KINDS = ['METRIC', 'CLIENT_LIST', 'AGENDA'] as const;
export type AiChatCardKind = (typeof AI_CHAT_CARD_KINDS)[number];

// ────────────────────────────────────────────────────────────── Mensagens ───

export interface AiChatMessageItem {
  id: string;
  role: AiMessageRole;
  content: string;
  /** Cartão estruturado que acompanha a resposta, quando houver. */
  card: AiChatCard | null;
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
  /**
   * Os chips do rodapé (protótipo l.2967–2971). Vêm do servidor porque só ele
   * sabe o que o driver ativo consegue responder de verdade.
   */
  suggestions: string[];
}
