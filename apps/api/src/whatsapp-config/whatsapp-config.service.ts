import { Inject, Injectable } from '@nestjs/common';
import { OutboxStatus, Prisma, WhatsappEvent } from '@prisma/client';
import {
  hasFeature,
  WHATSAPP_BASIC_EVENTS,
  WHATSAPP_CONTROL,
  WHATSAPP_DEFAULT_OFFSET_MINUTES,
  WHATSAPP_DEFAULT_TEMPLATES,
  WHATSAPP_EVENT_ORDER,
  WHATSAPP_REACTIVATION_OPTIONS_DAYS,
  WHATSAPP_REMINDER_OPTIONS_MINUTES,
  type WhatsappAutomationItem,
  type WhatsappConnection,
  type WhatsappHistoryItem,
  type WhatsappHistoryPage,
  type WhatsappReactivationResult,
  type WhatsappAutomationsResponse,
  type WhatsappReactivationSummary,
  type WhatsappTemplateSample,
  renderWhatsappTemplate,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CONFIG, type AppConfig } from '../config/configuration';
import {
  NOTIFICATION_ADAPTER,
  type NotificationAdapter,
} from '../adapters/notification/notification.adapter';
import { maskPhone } from '../common/utils/mask';
import { zonedParts } from '../common/utils/timezone';
import type { RequestContext } from '../common/types/request-context';
import type {
  UpdateWhatsappAutomationDto,
  WhatsappHistoryQueryDto,
} from './dto/whatsapp-config.dto';

const MINUTES_PER_DAY = 24 * 60;

/** Teto de destinatários por disparo em massa — o mesmo espírito do `EXPORT_LIMIT` da aba Clientes. */
const REACTIVATION_LIMIT = 500;

/** `templateKey` dos envios que a própria aba dispara (o botão da faixa dourada). */
const REACTIVATION_TEMPLATE_KEY = `whatsapp.${WhatsappEvent.REACTIVATION.toLowerCase()}`;

@Injectable()
export class WhatsappConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(NOTIFICATION_ADAPTER) private readonly notifications: NotificationAdapter,
  ) {}

  // ── Automações ──────────────────────────────────────────────────────────

  /**
   * Os SEIS eventos, sempre, na ordem do protótipo.
   *
   * Uma barbearia recém-cadastrada não tem linha nenhuma em
   * `WhatsappAutomationConfig` (o `register` da fase 03 não as cria), e uma
   * antiga pode ter só algumas. Antes disto a aba abria vazia para todo tenant
   * novo. Nada é escrito aqui: a linha nasce no primeiro `update`.
   */
  async list(tenantId: string): Promise<WhatsappAutomationsResponse> {
    const [configs, hasFull, sample] = await Promise.all([
      this.prisma.whatsappAutomationConfig.findMany({ where: { tenantId } }),
      this.hasFullFeature(tenantId),
      this.templateSample(tenantId),
    ]);

    const byEvent = new Map(configs.map((config) => [config.event, config]));

    const items: WhatsappAutomationItem[] = WHATSAPP_EVENT_ORDER.map((event) => {
      const config = byEvent.get(event);
      const requiresFullFeature = !WHATSAPP_BASIC_EVENTS.includes(event);
      const locked = requiresFullFeature && !hasFull;

      return {
        event,
        // Sem o recurso completo, o evento avançado aparece SEMPRE desligado —
        // é o que o servidor de fato faz quando a mensagem tenta sair.
        enabled: locked ? false : (config?.enabled ?? false),
        template: config?.template ?? WHATSAPP_DEFAULT_TEMPLATES[event],
        offsetMinutes: config?.offsetMinutes ?? WHATSAPP_DEFAULT_OFFSET_MINUTES[event],
        requiresFullFeature,
        locked,
        control: WHATSAPP_CONTROL[event],
        options: optionsFor(event),
      };
    });

    return { items, sample };
  }

  async update(
    tenantId: string,
    event: WhatsappEvent,
    dto: UpdateWhatsappAutomationDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<WhatsappAutomationItem> {
    const requiresFullFeature = !WHATSAPP_BASIC_EVENTS.includes(event);

    // O gate cobre a linha inteira, não só o `enabled`: editar o template de
    // uma automação que o plano não cobre também é 403 — senão o dono ajusta
    // a mensagem de aniversário e fica achando que comprou o recurso.
    if (requiresFullFeature && !(await this.hasFullFeature(tenantId))) {
      throw ApiException.featureNotInPlan('whatsappCompleto');
    }

    const offsetMinutes =
      dto.offsetMinutes === undefined ? undefined : this.validateOffset(event, dto.offsetMinutes);

    const existing = await this.prisma.whatsappAutomationConfig.findUnique({
      where: { tenantId_event: { tenantId, event } },
    });

    const enabled = dto.enabled ?? existing?.enabled ?? false;
    // `enabledAt` marca a PRIMEIRA vez que a automação foi ligada e não é
    // reescrito depois: é a data que o gráfico "Taxa de faltas por mês"
    // (Relatórios) usa como linha de corte. Desligar não apaga o marco — o
    // lembrete de fato saiu naquele período, e o histórico não muda.
    const enabledAt = enabled && !existing?.enabledAt ? new Date() : (existing?.enabledAt ?? null);
    const template = dto.template ?? existing?.template ?? WHATSAPP_DEFAULT_TEMPLATES[event];
    const offset =
      offsetMinutes !== undefined
        ? offsetMinutes
        : (existing?.offsetMinutes ?? WHATSAPP_DEFAULT_OFFSET_MINUTES[event]);

    // `upsert` e não `update`: a linha pode simplesmente não existir ainda —
    // é o caso de toda barbearia que nunca abriu esta aba.
    const updated = await this.prisma.whatsappAutomationConfig.upsert({
      where: { tenantId_event: { tenantId, event } },
      create: { tenantId, event, enabled, enabledAt, template, offsetMinutes: offset },
      update: { enabled, enabledAt, template, offsetMinutes: offset },
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
      requiresFullFeature,
      locked: false,
      control: WHATSAPP_CONTROL[event],
      options: optionsFor(event),
    };
  }

  // ── Conexão ─────────────────────────────────────────────────────────────

  /**
   * Estado do canal — o card "Conexão com WhatsApp" (protótipo l.1626).
   *
   * O desenho mostra um pareamento por QR code, que só existe com um provedor
   * real do outro lado. Enquanto `NOTIFICATION_DRIVER=mock`, a resposta diz
   * isso com todas as letras em vez de fingir um número conectado: a tela não
   * tem o direito de inventar um pareamento que não aconteceu.
   */
  async connection(tenantId: string): Promise<WhatsappConnection> {
    const messagesSent = await this.prisma.notificationOutbox.count({
      where: { tenantId, channel: 'WHATSAPP' },
    });
    const isMock = this.config.drivers.notification === 'mock';

    return {
      driver: isMock ? 'MOCK' : 'PROVIDER',
      connected: !isMock,
      phone: null,
      messagesSent,
    };
  }

  // ── Histórico de envios ─────────────────────────────────────────────────

  /**
   * A tabela "Histórico de envios" (l.1695) lida do `NotificationOutbox` do
   * tenant. `/admin/outbox` já existia, mas é do super admin e cruza todas as
   * barbearias — este é o recorte que o dono pode ver.
   *
   * O nome do cliente sai de UMA consulta a mais sobre os telefones da página
   * (nunca uma por linha): `NotificationOutbox` guarda o destino, não o
   * `clientId`, porque também serve a mensagens de quem ainda não é cliente.
   */
  async history(tenantId: string, query: WhatsappHistoryQueryDto): Promise<WhatsappHistoryPage> {
    const limit = query.limit ?? 25;

    const rows = await this.prisma.notificationOutbox.findMany({
      where: { tenantId, channel: 'WHATSAPP' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        recipient: true,
        templateKey: true,
        body: true,
        payload: true,
        status: true,
        sentAt: true,
        createdAt: true,
      },
    });

    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? (page.at(-1)?.id ?? null) : null;

    const phones = [...new Set(page.map((row) => row.recipient))];
    const profiles = phones.length
      ? await this.prisma.clientProfile.findMany({
          where: { tenantId, deletedAt: null, client: { phone: { in: phones } } },
          select: { id: true, client: { select: { name: true, phone: true } } },
        })
      : [];
    const byPhone = new Map(profiles.map((row) => [row.client.phone, row]));

    const items: WhatsappHistoryItem[] = page.map((row) => {
      const profile = byPhone.get(row.recipient);
      return {
        id: row.id,
        // `sentAt` é o carimbo de saída; enquanto a mensagem não saiu, a linha
        // se ordena e se mostra pela criação.
        sentAt: (row.sentAt ?? row.createdAt).toISOString(),
        clientName: profile?.client.name ?? null,
        clientProfileId: profile?.id ?? null,
        // Sem nome na base, o telefone aparece MASCARADO — a tela não é lugar
        // de despejar número inteiro de quem não é cliente daqui.
        recipient: maskPhone(row.recipient),
        templateKey: row.templateKey,
        event: eventOf(row.templateKey, row.payload),
        status: row.status,
        delivered: row.status === OutboxStatus.SENT && row.sentAt !== null,
        body: row.body,
      };
    });

    return { items, nextCursor };
  }

  // ── Reativação em massa ─────────────────────────────────────────────────

  /**
   * A faixa dourada (l.1688) e o preview do modal (l.4318).
   *
   * A janela NÃO é fixa em 30 dias: é o `offsetMinutes` da automação de
   * reativação, o mesmo `<select>` "Após N dias" da linha logo acima. Mudar o
   * seletor muda a contagem da faixa — é a mesma pergunta feita uma vez só.
   */
  async reactivationSummary(tenantId: string): Promise<WhatsappReactivationSummary> {
    const [config, hasFull, sample] = await Promise.all([
      this.prisma.whatsappAutomationConfig.findUnique({
        where: { tenantId_event: { tenantId, event: WhatsappEvent.REACTIVATION } },
        select: { template: true, offsetMinutes: true },
      }),
      this.hasFullFeature(tenantId),
      this.templateSample(tenantId),
    ]);

    const inactiveDays = daysOf(
      config?.offsetMinutes ?? WHATSAPP_DEFAULT_OFFSET_MINUTES.REACTIVATION,
    );
    const template = config?.template ?? WHATSAPP_DEFAULT_TEMPLATES.REACTIVATION;
    const where = this.inactiveWhere(tenantId, inactiveDays);

    const [clientCount, optedInCount] = await Promise.all([
      this.prisma.clientProfile.count({ where }),
      this.prisma.clientProfile.count({
        where: this.inactiveWhere(tenantId, inactiveDays, { notifyWhatsapp: true }),
      }),
    ]);

    return {
      inactiveDays,
      clientCount,
      optedOutCount: clientCount - optedInCount,
      // Mesmo balão do editor: placeholders resolvidos com dados REAIS do
      // tenant. Quem troca o `{nome}` pelo nome de cada destinatário é o
      // envio, cliente a cliente — este é só o exemplo que o dono confere.
      preview: renderWhatsappTemplate(template, sample),
      locked: !hasFull,
    };
  }

  /**
   * O botão "Enviar mensagem de reativação agora".
   *
   * Tudo pelo `NotificationAdapter` — no driver mock cada mensagem vira uma
   * linha em `NotificationOutbox`, e aparece no "Histórico de envios" logo
   * abaixo. Nenhuma chamada externa nesta fase.
   */
  async sendReactivation(
    tenantId: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<WhatsappReactivationResult> {
    if (!(await this.hasFullFeature(tenantId))) {
      throw ApiException.featureNotInPlan('whatsappCompleto');
    }

    const [summary, config] = await Promise.all([
      this.reactivationSummary(tenantId),
      this.prisma.whatsappAutomationConfig.findUnique({
        where: { tenantId_event: { tenantId, event: WhatsappEvent.REACTIVATION } },
        select: { template: true },
      }),
    ]);
    // O corpo sai do TEMPLATE, nunca do `summary.preview`: o preview já teve
    // `{barbeiro}`/`{servico}` resolvidos com o exemplo da barbearia, e mandar
    // isso ao cliente diria o serviço errado para quase todo mundo.
    const template = config?.template ?? WHATSAPP_DEFAULT_TEMPLATES.REACTIVATION;

    const targets = await this.prisma.clientProfile.findMany({
      where: this.inactiveWhere(tenantId, summary.inactiveDays),
      select: { id: true, client: { select: { id: true, name: true, phone: true, notifyWhatsapp: true } } },
      orderBy: { lastVisitAt: 'asc' },
      take: REACTIVATION_LIMIT,
    });

    // Quem desligou o aviso por WhatsApp é pulado e CONTADO — a tela precisa
    // dizer que 3 dos 38 não receberam, em vez de mentir que foram 38.
    const allowed = targets.filter((row) => row.client.notifyWhatsapp);

    for (const row of allowed) {
      await this.notifications.send({
        tenantId,
        recipient: row.client.phone,
        templateKey: REACTIVATION_TEMPLATE_KEY,
        body: template.replace(/\{nome\}/g, firstName(row.client.name) ?? row.client.name),
        payload: {
          event: WhatsappEvent.REACTIVATION,
          clientProfileId: row.id,
          clientId: row.client.id,
        },
      });
    }

    await this.audit.record(
      {
        action: AuditAction.WHATSAPP_REACTIVATION_SENT,
        entity: 'Tenant',
        entityId: tenantId,
        tenantId,
        actorUserId,
        metadata: {
          inactiveDays: summary.inactiveDays,
          targeted: targets.length,
          queued: allowed.length,
        },
      },
      request,
    );

    return { queued: allowed.length, skipped: targets.length - allowed.length };
  }

  // ── Apoio ───────────────────────────────────────────────────────────────

  /**
   * Valores de exemplo para a pré-visualização — TODOS do próprio tenant.
   *
   * O protótipo resolve o balão com um cliente inventado ("João Pedro",
   * "Corte + Barba", "Diego" — `SAMPLE`, l.6053). Escrever isso no front seria
   * exatamente o que a regra 1 proíbe, então o exemplo sai de um serviço do
   * catálogo, de um barbeiro da equipe, de um cliente da base e do link
   * público de verdade. Barbearia recém-cadastrada ainda não tem nada disso:
   * aí o placeholder fica visível, que é honesto — não há o que pré-visualizar.
   */
  private async templateSample(tenantId: string): Promise<WhatsappTemplateSample> {
    const [tenant, barber, service, profile] = await Promise.all([
      this.prisma.tenant.findFirst({
        where: { id: tenantId },
        select: { slug: true, timezone: true },
      }),
      this.prisma.barber.findFirst({
        where: { tenantId, active: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { name: true },
      }),
      this.prisma.service.findFirst({
        where: { tenantId, active: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { name: true },
      }),
      this.prisma.clientProfile.findFirst({
        where: { tenantId, deletedAt: null, blocked: false },
        orderBy: { lastVisitAt: 'desc' },
        select: { client: { select: { name: true } } },
      }),
    ]);

    const timezone = tenant?.timezone ?? 'America/Sao_Paulo';
    // Amanhã: é quando o lembrete de 24h de fato cairia, e evita um exemplo
    // com data no passado logo depois da meia-noite.
    const when = new Date(Date.now() + MINUTES_PER_DAY * 60 * 1_000);
    const parts = zonedParts(when, timezone);

    return {
      nome: firstName(profile?.client.name) ?? '{nome}',
      data: `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}`,
      horario: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
      servico: service?.name ?? '{servico}',
      barbeiro: firstName(barber?.name) ?? '{barbeiro}',
      link_agendamento: tenant?.slug
        ? `${this.config.urls.publicBooking}/${tenant.slug}`
        : '{link_agendamento}',
    };
  }

  private async hasFullFeature(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { plan: { select: { features: true } } },
    });
    return hasFeature(tenant?.plan?.features, 'whatsappCompleto');
  }

  /**
   * Mesmo recorte de "inativo" da aba Clientes: sem visita desde o corte, ou
   * nunca visitou E foi cadastrado antes dele — recém-cadastrado sem visita é
   * cliente NOVO, não sumido, e receber "faz tempo que não te vemos" no dia
   * seguinte ao cadastro seria constrangedor.
   */
  private inactiveWhere(
    tenantId: string,
    inactiveDays: number,
    client?: Prisma.ClientWhereInput,
  ): Prisma.ClientProfileWhereInput {
    const cutoff = new Date(Date.now() - inactiveDays * MINUTES_PER_DAY * 60 * 1_000);
    return {
      tenantId,
      deletedAt: null,
      // Cliente bloqueado não recebe campanha — ele pediu para não ser
      // atendido, e "volta pra gente" seria o oposto disso.
      blocked: false,
      ...(client ? { client } : {}),
      OR: [
        { lastVisitAt: { lt: cutoff } },
        { AND: [{ lastVisitAt: null }, { createdAt: { lt: cutoff } }] },
      ],
    };
  }

  /**
   * O valor tem de estar entre as opções que a própria API publicou em
   * `options`. Sem isto, um `PATCH` com 7h de antecedência entraria no banco e
   * o `<select>` da tela ficaria sem opção correspondente selecionada.
   */
  private validateOffset(event: WhatsappEvent, value: number | null): number | null {
    const control = WHATSAPP_CONTROL[event];

    if (control === 'NONE') {
      return null;
    }
    if (value === null) {
      throw ApiException.badRequest('Informe o horário ou a antecedência da automação.');
    }
    if (control === 'DELAY_BEFORE' && !WHATSAPP_REMINDER_OPTIONS_MINUTES.includes(value)) {
      throw ApiException.badRequest('Antecedência inválida para o lembrete.');
    }
    if (control === 'TIME_OF_DAY' && (value < 0 || value >= MINUTES_PER_DAY)) {
      throw ApiException.badRequest('Horário de envio inválido.');
    }
    if (
      control === 'INACTIVITY_DAYS' &&
      !WHATSAPP_REACTIVATION_OPTIONS_DAYS.includes(daysOf(value))
    ) {
      throw ApiException.badRequest('Janela de inatividade inválida para a reativação.');
    }
    return value;
  }
}

/** As opções do `<select>` daquela linha, na unidade do controle. */
function optionsFor(event: WhatsappEvent): number[] {
  switch (WHATSAPP_CONTROL[event]) {
    case 'DELAY_BEFORE':
      return [...WHATSAPP_REMINDER_OPTIONS_MINUTES];
    case 'INACTIVITY_DAYS':
      return [...WHATSAPP_REACTIVATION_OPTIONS_DAYS];
    default:
      return [];
  }
}

function firstName(name: string | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : null;
}

function daysOf(offsetMinutes: number | null): number {
  return Math.round((offsetMinutes ?? 0) / MINUTES_PER_DAY);
}

/**
 * De que automação veio a linha do outbox.
 *
 * `payload.event` é a fonte boa (o `BookingNotificationsService` e o disparo
 * em massa gravam ali); o prefixo do `templateKey` cobre o que foi escrito
 * antes de o payload existir. Nulo em avulso — a mensagem em lote da aba
 * Clientes, por exemplo, não é automação nenhuma.
 */
function eventOf(templateKey: string, payload: Prisma.JsonValue | null): WhatsappEvent | null {
  const fromPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).event
      : null;

  // Três formas de `templateKey` convivem no outbox: `appointment.reminder`
  // (fase 07), `whatsapp.reactivation` (esta aba) e o nome do evento cru
  // (`CONFIRMATION`), que é o que o seed de demonstração grava.
  const candidates = [
    typeof fromPayload === 'string' ? fromPayload : null,
    templateKey.split('.').at(1)?.toUpperCase() ?? null,
    templateKey.toUpperCase(),
  ];

  const match = candidates.find(
    (candidate): candidate is string =>
      candidate !== null && (WHATSAPP_EVENT_ORDER as readonly string[]).includes(candidate),
  );

  return (match as WhatsappEvent | undefined) ?? null;
}
