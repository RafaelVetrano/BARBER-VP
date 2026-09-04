import { Injectable } from '@nestjs/common';
import type { AiChatCard } from '@barbervp/types';
import type {
  AiAssistantAdapter,
  AiAssistantReply,
  AiAssistantReplyParams,
  AssistantInsightsPort,
} from './ai-assistant.adapter';

/** Centavos → moeda, no mesmo formato do resto do produto. */
function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Intenções que o driver de REGRAS consegue atender. Cada uma é uma pergunta
 * de LEITURA — ver a nota sobre ações de escrita no final do arquivo.
 */
type Intent = 'REVENUE' | 'INACTIVE' | 'AGENDA' | 'TICKET' | null;

const INTENT_TERMS: Array<{ intent: Exclude<Intent, null>; terms: string[] }> = [
  { intent: 'TICKET', terms: ['ticket', 'ticket médio', 'valor médio', 'média por cliente'] },
  { intent: 'REVENUE', terms: ['faturamento', 'faturei', 'fatura', 'receita', 'vendi', 'caixa', 'quanto ganhei'] },
  { intent: 'INACTIVE', terms: ['inativo', 'inativos', 'sumido', 'sumidos', 'não vem', 'nao vem', 'não voltam', 'reativa'] },
  { intent: 'AGENDA', terms: ['agenda', 'agendamento', 'horário', 'horario', 'hoje', 'atendimento'] },
];

/** Sem acento e em minúsculas — "horário" e "horario" caem na mesma regra. */
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detect(message: string): Intent {
  const text = normalize(message);
  for (const { intent, terms } of INTENT_TERMS) {
    if (terms.some((term) => text.includes(normalize(term)))) return intent;
  }
  return null;
}

/**
 * Driver mock — a "inteligência" é um classificador de palavra-chave, mas os
 * NÚMEROS são reais: cada intenção chama `AssistantInsightsPort`, que consulta
 * o tenant. Nenhum valor do protótipo aparece aqui.
 *
 * Trocar por um provedor real é substituir esta classe no `AdaptersModule`
 * (`AI_ASSISTANT_DRIVER`), mantendo `insights` como o conjunto de tools.
 */
@Injectable()
export class MockAiAssistantDriver implements AiAssistantAdapter {
  suggestions(): string[] {
    // Só o que o classificador acima realmente responde — sugerir uma pergunta
    // que cairia no fallback seria um chip morto (regra 2 do enunciado).
    return [
      'Quanto faturei essa semana?',
      'Qual o meu ticket médio?',
      'Como está a agenda de hoje?',
      'Quais clientes não vêm há 30 dias?',
    ];
  }

  async reply(params: AiAssistantReplyParams): Promise<AiAssistantReply> {
    const intent = detect(params.message);
    if (intent === null) return this.fallback();

    const card = await this.resolve(intent, params.insights);
    if (card === null) return this.emptyFor(intent);

    return { text: this.textFor(intent, card), card };
  }

  private resolve(intent: Exclude<Intent, null>, insights: AssistantInsightsPort): Promise<AiChatCard | null> {
    switch (intent) {
      case 'REVENUE':
        return insights.revenueThisWeek();
      case 'TICKET':
        return insights.averageTicketThisMonth();
      case 'INACTIVE':
        return insights.inactiveClients();
      case 'AGENDA':
        return insights.agendaToday();
    }
  }

  /** O texto do balão repete o número do cartão — como no protótipo (l.2846). */
  private textFor(intent: Exclude<Intent, null>, card: AiChatCard): string {
    switch (card.kind) {
      case 'METRIC': {
        const value = brl(card.valueCents);
        if (intent === 'TICKET') {
          return `Seu ticket médio nos últimos 30 dias é de ${value}, considerando ${card.deltaLabel}.`;
        }
        if (card.deltaPercent === null) {
          return `Você faturou ${value} nos últimos 7 dias. Ainda não tenho a semana anterior fechada para comparar.`;
        }
        const direction = card.deltaPercent >= 0 ? 'acima' : 'abaixo';
        return `Você faturou ${value} nos últimos 7 dias, ${Math.abs(card.deltaPercent)}% ${direction} da semana anterior.`;
      }
      case 'CLIENT_LIST':
        return 'Separei quem está sumido há mais tempo. Dá para chamar todo mundo de uma vez pela automação de reativação do WhatsApp.';
      case 'AGENDA':
        return `Sua agenda de hoje tem ${card.total} atendimento${card.total === 1 ? '' : 's'}. Os próximos estão logo abaixo.`;
    }
  }

  /** Vazio é resposta, não erro — tenant novo tem de ouvir algo que faça sentido. */
  private emptyFor(intent: Exclude<Intent, null>): AiAssistantReply {
    const text: Record<Exclude<Intent, null>, string> = {
      REVENUE:
        'Ainda não há comanda fechada nos últimos 7 dias, então não tenho faturamento para somar. Assim que a primeira for fechada, o número aparece aqui.',
      TICKET:
        'Ainda não tenho comandas fechadas suficientes para calcular um ticket médio. Feche os primeiros atendimentos e eu passo a acompanhar.',
      INACTIVE:
        'Boa notícia: nenhum cliente está sem visita há mais de 30 dias. Sua base está em dia.',
      AGENDA: 'Não há nenhum atendimento marcado para hoje na sua agenda.',
    };
    return { text: text[intent], card: null };
  }

  /**
   * Fora das quatro intenções o driver DIZ que não sabe, em vez de inventar.
   * Um assistente de regras que finge entender tudo é pior que um que declara
   * o próprio limite — e o provedor real entra exatamente aqui.
   */
  private fallback(): AiAssistantReply {
    return {
      text: 'Sou o Navalha, o assistente do BarberVP 🪒 — por enquanto consigo responder sobre faturamento, ticket médio, agenda do dia e clientes inativos. Use as sugestões abaixo, ou me pergunte de outro jeito.',
      card: null,
    };
  }
}
