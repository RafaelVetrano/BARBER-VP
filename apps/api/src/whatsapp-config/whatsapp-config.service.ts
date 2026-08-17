import { Injectable } from '@nestjs/common';
import { WhatsappEvent } from '@prisma/client';
import { hasFeature, WHATSAPP_BASIC_EVENTS, type WhatsappAutomationItem } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import type { UpdateWhatsappAutomationDto } from './dto/whatsapp-config.dto';

@Injectable()
export class WhatsappConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string): Promise<WhatsappAutomationItem[]> {
    const [configs, tenant] = await Promise.all([
      this.prisma.whatsappAutomationConfig.findMany({ where: { tenantId } }),
      this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { plan: { select: { features: true } } } }),
    ]);
    const hasFull = hasFeature(tenant?.plan?.features, 'whatsappCompleto');

    return configs.map((config) => ({
      event: config.event,
      enabled: config.enabled,
      template: config.template,
      offsetMinutes: config.offsetMinutes,
      requiresFullFeature: !WHATSAPP_BASIC_EVENTS.includes(config.event),
    })).map((item) => ({
      ...item,
      // Sem o feature completo, os eventos avançados sempre aparecem desligados.
      enabled: item.requiresFullFeature && !hasFull ? false : item.enabled,
    }));
  }

  async update(
    tenantId: string,
    event: WhatsappEvent,
    dto: UpdateWhatsappAutomationDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<WhatsappAutomationItem> {
    const isBasic = WHATSAPP_BASIC_EVENTS.includes(event);

    if (!isBasic && dto.enabled) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId },
        select: { plan: { select: { features: true } } },
      });
      if (!hasFeature(tenant?.plan?.features, 'whatsappCompleto')) {
        throw ApiException.featureNotInPlan('whatsappCompleto');
      }
    }

    const existing = await this.prisma.whatsappAutomationConfig.findUnique({
      where: { tenantId_event: { tenantId, event } },
    });
    if (!existing) {
      throw ApiException.notFound('Automação não encontrada.');
    }

    const updated = await this.prisma.whatsappAutomationConfig.update({
      where: { tenantId_event: { tenantId, event } },
      data: {
        enabled: dto.enabled ?? existing.enabled,
        template: dto.template ?? existing.template,
        offsetMinutes: dto.offsetMinutes !== undefined ? dto.offsetMinutes : existing.offsetMinutes,
      },
    });

    await this.audit.record(
      {
        action: AuditAction.WHATSAPP_AUTOMATION_UPDATED,
        entity: 'WhatsappAutomationConfig',
        entityId: updated.id,
        tenantId,
        actorUserId,
        metadata: { event },
      },
      request,
    );

    return {
      event: updated.event,
      enabled: updated.enabled,
      template: updated.template,
      offsetMinutes: updated.offsetMinutes,
      requiresFullFeature: !isBasic,
    };
  }
}
