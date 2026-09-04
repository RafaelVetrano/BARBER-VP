import { Inject, Injectable } from '@nestjs/common';
import { AiMessageRole, Prisma } from '@prisma/client';
import {
  AI_MESSAGE_LIMIT_BY_TIER,
  type AiChatCard,
  type AiChatHistoryResponse,
  type AiChatMessageItem,
  type AiChatResponse,
  type AiChatUsage,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AI_ASSISTANT_ADAPTER, type AiAssistantAdapter } from './ai-assistant.adapter';
import { AssistantInsightsService } from './assistant-insights.service';

/** Quantas mensagens o histórico devolve — ver dívida de paginação no CONTEXT. */
const HISTORY_LIMIT = 100;

/** Contexto de conversa entregue ao driver. */
const CONTEXT_MESSAGES = 10;

function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

type MessageRow = {
  id: string;
  role: AiMessageRole;
  content: string;
  card: Prisma.JsonValue | null;
  createdAt: Date;
};

function toItem(row: MessageRow): AiChatMessageItem {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    card: (row.card as AiChatCard | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: AssistantInsightsService,
    @Inject(AI_ASSISTANT_ADAPTER) private readonly assistant: AiAssistantAdapter,
  ) {}

  async history(tenantId: string, userId: string): Promise<AiChatHistoryResponse> {
    const [messages, usage] = await Promise.all([
      this.prisma.aiChatMessage.findMany({
        where: { tenantId, userId, hiddenAt: null },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
        select: { id: true, role: true, content: true, card: true, createdAt: true },
      }),
      this.usage(tenantId),
    ]);

    return {
      // A consulta pega as ÚLTIMAS 100 (`desc`), a tela mostra em ordem de
      // conversa — sem o reverse, um histórico longo perderia o começo.
      messages: messages.reverse().map(toItem),
      usage,
      suggestions: this.assistant.suggestions(),
    };
  }

  async send(tenantId: string, userId: string, content: string): Promise<AiChatResponse> {
    const usage = await this.usage(tenantId);
    if (usage.limit !== null && usage.used >= usage.limit) {
      throw ApiException.forbidden(
        'Você atingiu o limite de mensagens do Assistente IA neste mês para o seu plano.',
        'AI_MESSAGE_LIMIT_REACHED',
      );
    }

    const history = await this.prisma.aiChatMessage.findMany({
      where: { tenantId, userId, hiddenAt: null },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_MESSAGES,
      select: { role: true, content: true },
    });

    await this.prisma.aiChatMessage.create({
      data: { tenantId, userId, role: AiMessageRole.USER, content },
    });

    const answer = await this.assistant.reply({
      tenantId,
      history: history.reverse(),
      message: content,
      // O driver recebe as ferramentas JÁ AMARRADAS a este tenant: ele não tem
      // como pedir número de outra barbearia nem sabe que outras existem.
      insights: this.insights.forTenant(tenantId),
    });

    const reply = await this.prisma.aiChatMessage.create({
      data: {
        tenantId,
        userId,
        role: AiMessageRole.ASSISTANT,
        content: answer.text,
        card: (answer.card ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
      },
      select: { id: true, role: true, content: true, card: true, createdAt: true },
    });

    return { message: toItem(reply), usage: await this.usage(tenantId) };
  }

  /**
   * "Limpar conversa" — esconde, NÃO apaga. A cota do mês é contada nestas
   * linhas: um delete daria mensagens de graça a quem limpasse o histórico.
   */
  async clear(tenantId: string, userId: string): Promise<AiChatHistoryResponse> {
    await this.prisma.aiChatMessage.updateMany({
      where: { tenantId, userId, hiddenAt: null },
      data: { hiddenAt: new Date() },
    });
    return this.history(tenantId, userId);
  }

  /**
   * A cota é do PLANO, logo é do TENANT — não de cada usuário. Contar por
   * usuário multiplicaria o limite pelo número de donos e gerentes da casa,
   * que é exatamente o que o tier deveria limitar.
   */
  private async usage(tenantId: string): Promise<AiChatUsage> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: { select: { tier: true } } },
    });

    // Sem plano (trial) vale o tier mais baixo: liberar ilimitado enquanto o
    // tenant não assina inverteria o incentivo do gate.
    const limit = tenant?.plan
      ? (AI_MESSAGE_LIMIT_BY_TIER[tenant.plan.tier] ?? null)
      : (AI_MESSAGE_LIMIT_BY_TIER[0] ?? null);

    const used = await this.prisma.aiChatMessage.count({
      where: { tenantId, role: AiMessageRole.USER, createdAt: { gte: monthStart() } },
    });

    return { used, limit };
  }
}
