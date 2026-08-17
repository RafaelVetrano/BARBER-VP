import { Inject, Injectable } from '@nestjs/common';
import { AiMessageRole } from '@prisma/client';
import { AI_MESSAGE_LIMIT_BY_TIER, type AiChatHistoryResponse, type AiChatResponse } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AI_ASSISTANT_ADAPTER, type AiAssistantAdapter } from './ai-assistant.adapter';

function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_ASSISTANT_ADAPTER) private readonly assistant: AiAssistantAdapter,
  ) {}

  async history(tenantId: string, userId: string): Promise<AiChatHistoryResponse> {
    const [messages, usage] = await Promise.all([
      this.prisma.aiChatMessage.findMany({
        where: { tenantId, userId },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
      this.usage(tenantId, userId),
    ]);

    return {
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
      usage,
    };
  }

  async send(tenantId: string, userId: string, content: string): Promise<AiChatResponse> {
    const usage = await this.usage(tenantId, userId);
    if (usage.limit !== null && usage.used >= usage.limit) {
      throw ApiException.forbidden(
        'Você atingiu o limite de mensagens do Assistente IA neste mês para o seu plano.',
        'AI_MESSAGE_LIMIT_REACHED',
      );
    }

    const history = await this.prisma.aiChatMessage.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true },
    });

    await this.prisma.aiChatMessage.create({
      data: { tenantId, userId, role: AiMessageRole.USER, content },
    });

    const replyText = await this.assistant.reply({
      tenantId,
      history: history.reverse(),
      message: content,
    });

    const reply = await this.prisma.aiChatMessage.create({
      data: { tenantId, userId, role: AiMessageRole.ASSISTANT, content: replyText },
    });

    return {
      message: {
        id: reply.id,
        role: reply.role,
        content: reply.content,
        createdAt: reply.createdAt.toISOString(),
      },
      usage: await this.usage(tenantId, userId),
    };
  }

  private async usage(tenantId: string, userId: string): Promise<{ used: number; limit: number | null }> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { plan: { select: { tier: true } } },
    });
    const limit = tenant?.plan ? AI_MESSAGE_LIMIT_BY_TIER[tenant.plan.tier] ?? null : AI_MESSAGE_LIMIT_BY_TIER[0]!;

    const used = await this.prisma.aiChatMessage.count({
      where: { tenantId, userId, role: AiMessageRole.USER, createdAt: { gte: monthStart() } },
    });

    return { used, limit };
  }
}
