/** Automações de WhatsApp — fase 07, reconstruída na fase 22. Nome de arquivo evita colisão com `booking.ts` (que já usa "whatsapp" para outra coisa). */

import type { OutboxStatus, WhatsappEvent } from './enums';

/**
 * Que controle acompanha cada automação na linha da lista — o `tipo` de
 * `AUTOMACOES_DEFS` (`Dashboard.dc.html` l.6006–6013).
 *
 * Mora aqui, e não no front, porque o SIGNIFICADO de `offsetMinutes` muda com
 * o controle: antecedência para o lembrete, hora do dia para o aniversário,
 * janela de inatividade para a reativação. Quem valida o valor é o servidor, e
 * ele precisa da mesma tabela.
 */
export type WhatsappControlKind =
  /** Sem parâmetro — dispara junto com o fato. */
  | 'NONE'
  /** "Enviar N antes" — `offsetMinutes` = minutos ANTES do horário. */
  | 'DELAY_BEFORE'
  /** "às HH:MM" — `offsetMinutes` = minutos desde a meia-noite. */
  | 'TIME_OF_DAY'
  /** "Após N dias" — `offsetMinutes` = dias de inatividade × 1440. */
  | 'INACTIVITY_DAYS';

export const WHATSAPP_CONTROL: Record<WhatsappEvent, WhatsappControlKind> = {
  REMINDER: 'DELAY_BEFORE',
  CONFIRMATION: 'NONE',
  CANCELLATION: 'NONE',
  BIRTHDAY: 'TIME_OF_DAY',
  REACTIVATION: 'INACTIVITY_DAYS',
  REVIEW: 'NONE',
};

/**
 * Ordem das linhas do card "Automações" (`AUTOMACOES_DEFS`, l.6006).
 *
 * O `findMany` do Prisma não promete ordem nenhuma; sem esta lista a tela
 * embaralharia os eventos a cada consulta.
 */
export const WHATSAPP_EVENT_ORDER: readonly WhatsappEvent[] = [
  'REMINDER',
  'CONFIRMATION',
  'CANCELLATION',
  'BIRTHDAY',
  'REACTIVATION',
  'REVIEW',
];

/** Antecedências oferecidas ao lembrete, em minutos (`['1h','3h','24h','48h']`). */
export const WHATSAPP_REMINDER_OPTIONS_MINUTES: readonly number[] = [60, 180, 1_440, 2_880];

/** Janelas de inatividade oferecidas à reativação, em dias (`['15','30','45','60']`). */
export const WHATSAPP_REACTIVATION_OPTIONS_DAYS: readonly number[] = [15, 30, 45, 60];

/** Padrão de cada automação quando a barbearia ainda não tocou nela. */
export const WHATSAPP_DEFAULT_OFFSET_MINUTES: Record<WhatsappEvent, number | null> = {
  /** 24h antes — a opção do meio da lista, e a que a barbearia demo usa. */
  REMINDER: 1_440,
  CONFIRMATION: null,
  CANCELLATION: null,
  /** 09:00, logo na abertura. */
  BIRTHDAY: 9 * 60,
  /** 30 dias — o mesmo `CLIENT_INACTIVE_DAYS` da aba Clientes. */
  REACTIVATION: 30 * 1_440,
  /** 2h depois do atendimento. */
  REVIEW: 120,
};

/**
 * Texto inicial de cada template.
 *
 * Precisa existir no PACOTE porque uma barbearia recém-cadastrada não tem
 * linha nenhuma em `WhatsappAutomationConfig` (o `register` da fase 03 não as
 * cria) — sem um padrão, a aba abriria com seis campos vazios. Não é dado do
 * protótipo virando conteúdo de tela: é o valor de fábrica, servido pela API
 * como qualquer outro dado.
 */
export const WHATSAPP_DEFAULT_TEMPLATES: Record<WhatsappEvent, string> = {
  REMINDER:
    'Olá {nome}! Passando pra lembrar do seu horário em {data} às {horario} — {servico} com {barbeiro}. Até lá!',
  CONFIRMATION:
    'Oi {nome}, seu agendamento está confirmado para {data} às {horario}. Serviço: {servico} com {barbeiro}.',
  CANCELLATION:
    'Olá {nome}, seu horário de {data} às {horario} foi cancelado. Quando quiser, é só reagendar: {link_agendamento}',
  BIRTHDAY: 'Feliz aniversário, {nome}! 🎉 Aproveite um mimo especial na sua próxima visita.',
  REACTIVATION: 'Faz tempo que não te vemos, {nome}! Que tal agendar um horário? {link_agendamento}',
  REVIEW: 'Olá {nome}, como foi seu atendimento com {barbeiro} no dia {data}? Sua opinião ajuda muito.',
};

export interface WhatsappAutomationItem {
  event: WhatsappEvent;
  enabled: boolean;
  template: string;
  offsetMinutes: number | null;
  /** Eventos além do básico (aniversário/reativação/avaliação) — atrás de `whatsappCompleto`. */
  requiresFullFeature: boolean;
  /** `true` quando `requiresFullFeature` e o plano da barbearia não cobre — o 🔒 da linha. */
  locked: boolean;
  control: WhatsappControlKind;
  /**
   * Valores aceitos pelo controle desta linha, na unidade do `control`
   * (minutos em `DELAY_BEFORE`, dias em `INACTIVITY_DAYS`). Vazio nos demais.
   *
   * Vem do servidor para que a tela não precise conhecer nenhuma constante:
   * o `<select>` é montado a partir da resposta.
   */
  options: number[];
}

/**
 * Valores REAIS da barbearia usados na pré-visualização dos templates.
 *
 * O protótipo resolve o preview com um cliente inventado (`SAMPLE`, l.6053:
 * "João Pedro", "Corte + Barba", "Diego"). Aqui os valores vêm do tenant —
 * um serviço do catálogo, um barbeiro da equipe, o link público de verdade —
 * porque nome de gente e de serviço são DADO, e dado não se escreve no front.
 */
export interface WhatsappTemplateSample {
  nome: string;
  data: string;
  horario: string;
  servico: string;
  barbeiro: string;
  link_agendamento: string;
}

export interface WhatsappAutomationsResponse {
  items: WhatsappAutomationItem[];
  sample: WhatsappTemplateSample;
}

/** Troca `{chave}` pelo valor correspondente; o que não conhece, deixa como está. */
export function renderWhatsappTemplate(
  template: string,
  sample: WhatsappTemplateSample,
): string {
  return template.replace(
    /\{(\w+)\}/g,
    (match, key: string) => (sample as unknown as Record<string, string>)[key] ?? match,
  );
}

export interface UpdateWhatsappAutomationDto {
  enabled?: boolean;
  template?: string;
  offsetMinutes?: number | null;
}

/** Eventos que fazem parte do básico, liberado em todo plano. */
export const WHATSAPP_BASIC_EVENTS: readonly WhatsappEvent[] = [
  'REMINDER',
  'CONFIRMATION',
  'CANCELLATION',
];

/**
 * Estado do canal de envio — o card "Conexão com WhatsApp" (l.1626–1657).
 *
 * O protótipo desenha um pareamento por QR code, que pressupõe um provedor
 * real. Enquanto o `NOTIFICATION_ADAPTER` estiver no driver mock (fase 09),
 * `driver` vem `'MOCK'` e a tela diz isso em vez de exibir um QR que não
 * pareia com nada.
 */
export interface WhatsappConnection {
  driver: 'MOCK' | 'PROVIDER';
  connected: boolean;
  /** Número conectado, quando houver provedor. `null` no driver mock. */
  phone: string | null;
  /** Mensagens já registradas no outbox desta barbearia — a trilha do mock. */
  messagesSent: number;
}

/** Uma linha de "Histórico de envios" (l.1695–1719). */
export interface WhatsappHistoryItem {
  id: string;
  /** ISO — a tela formata em `dd/MM HH:mm`, no fuso da barbearia. */
  sentAt: string;
  /** Nome do cliente quando o telefone bate com a base; `null` em avulsos. */
  clientName: string | null;
  clientProfileId: string | null;
  /** Telefone mascarado — a tela mostra isso quando não há nome. */
  recipient: string;
  templateKey: string;
  /** `WhatsappEvent` quando o envio veio de uma automação; `null` nos avulsos. */
  event: WhatsappEvent | null;
  status: OutboxStatus;
  /** `true` = `SENT` com `sentAt` carimbado → "✓✓ Entregue". */
  delivered: boolean;
  body: string;
}

export interface WhatsappHistoryPage {
  items: WhatsappHistoryItem[];
  /** `null` quando não há mais páginas. */
  nextCursor: string | null;
}

/** A faixa dourada de reativação (l.1688–1691) e o modal de envio em massa (l.4318). */
export interface WhatsappReactivationSummary {
  /** Janela configurada na automação de reativação, em dias. */
  inactiveDays: number;
  /** Clientes sem visita há `inactiveDays` dias. */
  clientCount: number;
  /** Quantos deles desligaram o aviso por WhatsApp e NÃO vão receber. */
  optedOutCount: number;
  /** Template da reativação com os placeholders resolvidos, para o preview. */
  preview: string;
  /** Espelha o gate: `true` = o botão sai com 🔒 e o POST devolve 403. */
  locked: boolean;
}

export interface WhatsappReactivationResult {
  queued: number;
  skipped: number;
}
