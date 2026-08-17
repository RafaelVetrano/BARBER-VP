import { Injectable } from '@nestjs/common';
import type { AiAssistantAdapter, AiAssistantReplyParams } from './ai-assistant.adapter';

/**
 * Driver mock — respostas fixas com um toque de contexto, só para a interface
 * de chat ter o que mostrar sem depender de um provedor real de LLM.
 */
@Injectable()
export class MockAiAssistantDriver implements AiAssistantAdapter {
  async reply(params: AiAssistantReplyParams): Promise<string> {
    const text = params.message.toLowerCase();

    if (text.includes('faturamento') || text.includes('financeiro')) {
      return 'Ainda não tenho acesso aos números em tempo real neste ambiente de demonstração — mas assim que o provedor de IA for conectado, vou poder consultar seu faturamento, comissões e fluxo de caixa direto por aqui.';
    }
    if (text.includes('agenda') || text.includes('horário')) {
      return 'Posso te ajudar a entender sua agenda assim que estiver com o provedor de IA conectado. Por enquanto, veja a aba Agenda para os horários do dia.';
    }

    return 'Sou o Navalha, o assistente do BarberVP 🪒 — esta é uma resposta de exemplo (o provedor de IA real ainda não está conectado nesta fase). Em breve vou poder ajudar com dúvidas sobre sua operação, relatórios e sugestões pra crescer o negócio.';
  }
}
