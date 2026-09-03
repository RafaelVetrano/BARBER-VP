import { Inject, Injectable } from '@nestjs/common';
import { WhatsappEvent, type Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import {
  WHATSAPP_DEFAULT_OFFSET_MINUTES,
  WHATSAPP_DEFAULT_TEMPLATES,
  hasFeature,
} from '@barbervp/types';
import { PrismaService } from '../../prisma/prisma.service';
import { CONFIG, type AppConfig } from '../../config/configuration';
import {
  NOTIFICATION_ADAPTER,
  type NotificationAdapter,
} from '../../adapters/notification/notification.adapter';
import { zonedParts } from '../../common/utils/timezone';

export interface AutomationRunSummary {
  birthday: number;
  reactivation: number;
  review: number;
  tenants: number;
}

/** Teto por tenant e por evento numa rodada — a mesma ordem do envio manual. */
const BATCH_LIMIT = 500;

const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Automações de CALENDÁRIO do WhatsApp — aniversário, reativação e avaliação.
 *
 * **O buraco que isto fecha.** O dono ligava os três interruptores na aba
 * WhatsApp, o `enabled`/`enabledAt` era gravado, a tela dizia "ativa" — e
 * nada acontecia, nunca. O `BookingNotificationsService` só cobre confirmação,
 * lembrete e cancelamento, que são REAÇÕES a um agendamento; estes três são
 * disparos por calendário e não tinham quem os executasse. Três controles
 * prometendo um recurso inexistente, que é exatamente o que a regra 2 proíbe.
 *
 * Roda uma vez por dia, por tenant, e usa a mesma fila e o mesmo
 * `NotificationAdapter` de todo o resto: no driver mock cada mensagem vira uma
 * linha em `NotificationOutbox` e aparece no "Histórico de envios" da aba.
 *
 * **Idempotência é o ponto delicado**, porque um job diário que reenvia é pior
 * que um job que não roda: ninguém quer dois "feliz aniversário". Cada evento
 * consulta o próprio `NotificationOutbox` antes de enfileirar, com a janela
 * apropriada — e a chave é sempre (`tenantId`, `recipient`, `templateKey`), a
 * mesma trinca que o histórico mostra. Rodar o job duas vezes no mesmo dia não
 * duplica nada.
 */
@Injectable()
export class WhatsappAutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(NOTIFICATION_ADAPTER) private readonly notifications: NotificationAdapter,
  ) {
    this.logger.setContext(WhatsappAutomationsService.name);
  }

  async runOnce(now: Date = new Date()): Promise<AutomationRunSummary> {
    // Só tenants que LIGARAM ao menos uma das três. Barbearia que não usa a
    // automação não paga o custo de nenhuma consulta.
    const configs = await this.prisma.whatsappAutomationConfig.findMany({
      where: {
        enabled: true,
        event: { in: [WhatsappEvent.BIRTHDAY, WhatsappEvent.REACTIVATION, WhatsappEvent.REVIEW] },
        tenant: { deletedAt: null, purgeAt: null },
      },
      select: {
        tenantId: true,
        event: true,
        template: true,
        offsetMinutes: true,
        tenant: {
          select: { id: true, slug: true, timezone: true, plan: { select: { features: true } } },
        },
      },
    });

    const summary: AutomationRunSummary = { birthday: 0, reactivation: 0, review: 0, tenants: 0 };
    const tenantsTouched = new Set<string>();

    for (const config of configs) {
      /*
       * O GATE DE PLANO É RECONFERIDO AQUI, e não só na tela.
       *
       * `enabled` sobrevive a um downgrade: o dono liga a automação no
       * Avançado, cai para o Essencial e a linha continua `true` no banco. Sem
       * esta checagem, o job entregaria um recurso que a barbearia deixou de
       * pagar — e o gate deixaria de ser server-side de verdade.
       */
      if (!hasFeature(config.tenant.plan?.features, 'whatsappCompleto')) {
        continue;
      }

      tenantsTouched.add(config.tenantId);

      /*
       * Um tenant com erro não pode derrubar a varredura dos outros — a fila
       * tentaria de novo e os tenants já processados receberiam duas vezes.
       */
      try {
        const sent = await this.runEvent(config, now);
        if (config.event === WhatsappEvent.BIRTHDAY) summary.birthday += sent;
        if (config.event === WhatsappEvent.REACTIVATION) summary.reactivation += sent;
        if (config.event === WhatsappEvent.REVIEW) summary.review += sent;
      } catch (error) {
        this.logger.error(
          { err: error, tenantId: config.tenantId, event: config.event },
          'automação de calendário falhou para este tenant',
        );
      }
    }

    summary.tenants = tenantsTouched.size;
    return summary;
  }

  // ── Um evento, de um tenant ───────────────────────────────────────────────

  private async runEvent(config: AutomationConfigRow, now: Date): Promise<number> {
    switch (config.event) {
      case WhatsappEvent.BIRTHDAY:
        return this.runBirthday(config, now);
      case WhatsappEvent.REACTIVATION:
        return this.runReactivation(config, now);
      case WhatsappEvent.REVIEW:
        return this.runReview(config, now);
      default:
        return 0;
    }
  }

  /**
   * Aniversariantes DO DIA, no fuso do tenant.
   *
   * O dia é o da barbearia, não o do servidor: um tenant em Rio Branco (UTC-5)
   * recebendo o job às 21h de Brasília ainda está na véspera, e mandar
   * "feliz aniversário" um dia antes é pior que não mandar.
   *
   * `birthDate` é `@db.Date` (sem fuso), então a comparação é de mês/dia — sem
   * ano, que é o que "aniversário" significa.
   */
  private async runBirthday(config: AutomationConfigRow, now: Date): Promise<number> {
    const { month, day } = zonedParts(now, config.tenant.timezone);

    const targets = await this.prisma.$queryRaw<Array<{ clientId: string; name: string; phone: string }>>`
      SELECT c."id" AS "clientId", c."name", c."phone"
      FROM "ClientProfile" p
      JOIN "Client" c ON c."id" = p."clientId"
      WHERE p."tenantId" = ${config.tenantId}
        AND p."deletedAt" IS NULL
        AND p."blocked" = false
        AND c."deletedAt" IS NULL
        AND c."notifyWhatsapp" = true
        AND c."birthDate" IS NOT NULL
        AND EXTRACT(MONTH FROM c."birthDate") = ${month}
        AND EXTRACT(DAY FROM c."birthDate") = ${day}
      LIMIT ${BATCH_LIMIT}
    `;

    // Uma vez por ano: 300 dias de janela cobre o aniversário anterior sem
    // esbarrar no próximo.
    return this.deliver(config, targets, new Date(now.getTime() - 300 * DAY_MS), now);
  }

  /**
   * Clientes sumidos há mais tempo que a janela CONFIGURADA.
   *
   * A janela é o `offsetMinutes` da própria automação — o `<select>` "Após N
   * dias" que o agente 22 tornou configurável —, e não 30 dias fixos. É a
   * mesma pergunta que a faixa dourada da aba responde, e o mesmo recorte de
   * "inativo" da aba Clientes: sem visita desde o corte, ou nunca visitou E
   * foi cadastrado antes dele (recém-cadastrado é cliente NOVO, não sumido).
   */
  private async runReactivation(config: AutomationConfigRow, now: Date): Promise<number> {
    const windowMinutes = config.offsetMinutes ?? WHATSAPP_DEFAULT_OFFSET_MINUTES.REACTIVATION ?? 0;
    if (windowMinutes <= 0) return 0;

    const cutoff = new Date(now.getTime() - windowMinutes * MINUTE_MS);

    const rows = await this.prisma.clientProfile.findMany({
      where: {
        tenantId: config.tenantId,
        deletedAt: null,
        // Cliente bloqueado não recebe campanha — ele pediu para não ser
        // atendido, e "volta pra gente" seria o oposto disso.
        blocked: false,
        client: { deletedAt: null, notifyWhatsapp: true },
        OR: [
          { lastVisitAt: { lt: cutoff } },
          { AND: [{ lastVisitAt: null }, { createdAt: { lt: cutoff } }] },
        ],
      },
      select: { client: { select: { id: true, name: true, phone: true } } },
      orderBy: { lastVisitAt: 'asc' },
      take: BATCH_LIMIT,
    });

    const targets = rows.map((row) => ({
      clientId: row.client.id,
      name: row.client.name,
      phone: row.client.phone,
    }));

    /*
     * Não insistir dentro da própria janela: quem recebeu "faz tempo que não
     * te vemos" ontem continua inativo hoje, e receberia de novo todo santo
     * dia. Uma mensagem por janela de inatividade é o ritmo honesto.
     */
    return this.deliver(config, targets, new Date(now.getTime() - windowMinutes * MINUTE_MS), now);
  }

  /**
   * Pedido de avaliação, N minutos depois do atendimento CONCLUÍDO.
   *
   * A janela é fechada dos dois lados: só atendimentos que passaram do offset
   * e ainda estão dentro das últimas 24h. Sem o limite inferior, ligar a
   * automação hoje dispararia o pedido para todo atendimento já concluído na
   * história da barbearia — a primeira rodada mandaria milhares de mensagens.
   */
  private async runReview(config: AutomationConfigRow, now: Date): Promise<number> {
    const offsetMinutes = config.offsetMinutes ?? WHATSAPP_DEFAULT_OFFSET_MINUTES.REVIEW ?? 0;
    const until = new Date(now.getTime() - offsetMinutes * MINUTE_MS);
    const since = new Date(until.getTime() - DAY_MS);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId: config.tenantId,
        status: 'DONE',
        endsAt: { gte: since, lte: until },
        clientId: { not: null },
        client: { deletedAt: null, notifyWhatsapp: true },
      },
      select: {
        id: true,
        endsAt: true,
        client: { select: { id: true, name: true, phone: true } },
        barber: { select: { name: true } },
      },
      orderBy: { endsAt: 'asc' },
      take: BATCH_LIMIT,
    });

    let sent = 0;
    for (const appointment of appointments) {
      if (!appointment.client) continue;

      /*
       * Aqui a chave é o AGENDAMENTO, não o cliente: um cliente pode ser
       * atendido duas vezes no mesmo dia, e as duas merecem pedido próprio. O
       * `payload` do outbox guarda o `appointmentId` desde o
       * `BookingNotificationsService`, então a consulta é exata.
       */
      const already = await this.prisma.notificationOutbox.count({
        where: {
          tenantId: config.tenantId,
          templateKey: templateKeyOf(WhatsappEvent.REVIEW),
          payload: { path: ['appointmentId'], equals: appointment.id },
        },
      });
      if (already > 0) continue;

      await this.notifications.send({
        tenantId: config.tenantId,
        recipient: appointment.client.phone,
        templateKey: templateKeyOf(WhatsappEvent.REVIEW),
        body: this.render(config, {
          name: appointment.client.name,
          barberName: appointment.barber?.name ?? '',
          date: this.formatDate(appointment.endsAt, config.tenant.timezone),
        }),
        payload: {
          event: WhatsappEvent.REVIEW,
          appointmentId: appointment.id,
          clientId: appointment.client.id,
        },
      });
      sent += 1;
    }

    return sent;
  }

  // ── Comum ─────────────────────────────────────────────────────────────────

  /**
   * Enfileira para cada alvo que ainda não recebeu ESTE evento desde `since`.
   *
   * A consulta de deduplicação é uma só para o lote inteiro, e não uma por
   * cliente: são até 500 destinatários, e 500 idas ao banco para decidir 500
   * envios seria o pior tipo de N+1 — o que roda todo dia.
   */
  private async deliver(
    config: AutomationConfigRow,
    targets: Array<{ clientId: string; name: string; phone: string }>,
    since: Date,
    now: Date,
  ): Promise<number> {
    if (targets.length === 0) return 0;

    const alreadySent = await this.prisma.notificationOutbox.findMany({
      where: {
        tenantId: config.tenantId,
        templateKey: templateKeyOf(config.event),
        recipient: { in: targets.map((target) => target.phone) },
        createdAt: { gte: since },
      },
      select: { recipient: true },
      distinct: ['recipient'],
    });
    const skip = new Set(alreadySent.map((row) => row.recipient));

    let sent = 0;
    for (const target of targets) {
      if (skip.has(target.phone)) continue;

      await this.notifications.send({
        tenantId: config.tenantId,
        recipient: target.phone,
        templateKey: templateKeyOf(config.event),
        body: this.render(config, { name: target.name, date: this.formatDate(now, config.tenant.timezone) }),
        payload: {
          event: config.event,
          clientId: target.clientId,
          automated: true,
        },
      });
      sent += 1;
    }

    return sent;
  }

  /**
   * Substitui os placeholders com o que ESTE evento sabe.
   *
   * O que não se sabe some em vez de virar `{barbeiro}` na tela do cliente:
   * um aniversário não tem serviço nem horário, e deixar a chave crua seria
   * mandar `{servico}` literal para alguém.
   */
  private render(
    config: AutomationConfigRow,
    data: { name: string; barberName?: string; date?: string },
  ): string {
    const template = config.template || WHATSAPP_DEFAULT_TEMPLATES[config.event];
    const link = `${this.config.urls.publicBooking}/${config.tenant.slug}`;

    return template
      .replace(/\{nome\}/g, firstName(data.name))
      .replace(/\{barbeiro\}/g, data.barberName ?? '')
      .replace(/\{data\}/g, data.date ?? '')
      .replace(/\{link_agendamento\}/g, link)
      .replace(/\{horario\}/g, '')
      .replace(/\{servico\}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private formatDate(instant: Date, timeZone: string): string {
    const { year, month, day } = zonedParts(instant, timeZone);
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }
}

type AutomationConfigRow = {
  tenantId: string;
  event: WhatsappEvent;
  template: string;
  offsetMinutes: number | null;
  tenant: {
    id: string;
    slug: string;
    timezone: string;
    plan: { features: Prisma.JsonValue } | null;
  };
};

/** Mesma convenção do `BookingNotificationsService`: `appointment.<evento>`. */
function templateKeyOf(event: WhatsappEvent): string {
  return `whatsapp.${event.toLowerCase()}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
