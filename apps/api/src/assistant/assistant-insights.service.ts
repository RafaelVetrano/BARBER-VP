import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import {
  CLIENT_INACTIVE_DAYS,
  type AiChatAppointmentRow,
  type AiChatCard,
  type AiChatClientRow,
  type AiChatMetricPoint,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import type { AssistantInsightsPort } from './ai-assistant.adapter';

/** Quantas linhas cabem no cartão antes de virar "e mais N" (protótipo: 5). */
const CARD_ROWS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Iniciais como o protótipo monta (l.6156): duas primeiras palavras. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * `dd/MM` e `dd/MM às HH:mm` no fuso do tenant. Formatar no SERVIDOR (e não no
 * browser) é o que mantém a data igual para o dono que abre o painel viajando.
 */
function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone }).format(date);
}

function formatDateTime(date: Date, timeZone: string): string {
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    hour12: false,
  }).format(date);
  return `${formatDate(date, timeZone)} às ${time}`;
}

/** `YYYY-MM-DD` do dia LOCAL do tenant — o destino do "Ver na agenda". */
function isoDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date);
}

/** Início do dia local do tenant, em instante UTC. */
function startOfLocalDay(now: Date, timeZone: string): Date {
  const iso = isoDay(now, timeZone);
  // O deslocamento do fuso na data em questão, medido pela diferença entre o
  // mesmo instante lido como UTC e lido como local — evita depender de
  // biblioteca de fuso só para achar a meia-noite.
  const asUtc = new Date(`${iso}T00:00:00Z`);
  const offsetMs = asUtc.getTime() - new Date(asUtc.toLocaleString('en-US', { timeZone })).getTime();
  return new Date(asUtc.getTime() + offsetMs);
}

/**
 * As consultas REAIS por trás dos cartões do assistente.
 *
 * Existe separada do `AssistantService` porque é a camada de "ferramentas" que
 * o driver enxerga (`AssistantInsightsPort`): quando o provedor real entrar, é
 * este objeto que vira o conjunto de tools do LLM — sem que o driver ganhe
 * acesso ao Prisma.
 */
@Injectable()
export class AssistantInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liga o serviço a UM tenant — o driver nunca escolhe de quem são os números. */
  forTenant(tenantId: string): AssistantInsightsPort {
    return {
      revenueThisWeek: () => this.revenueThisWeek(tenantId),
      inactiveClients: () => this.inactiveClients(tenantId),
      agendaToday: () => this.agendaToday(tenantId),
      averageTicketThisMonth: () => this.averageTicketThisMonth(tenantId),
    };
  }

  private async timeZoneOf(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return tenant?.timezone ?? 'America/Sao_Paulo';
  }

  /**
   * Faturamento dos últimos 7 dias com a série diária da sparkline e a
   * variação contra os 7 anteriores — o cartão de l.2847.
   */
  private async revenueThisWeek(tenantId: string): Promise<AiChatCard | null> {
    const timeZone = await this.timeZoneOf(tenantId);
    const today = startOfLocalDay(new Date(), timeZone);
    const end = new Date(today.getTime() + DAY_MS);
    const start = new Date(end.getTime() - 7 * DAY_MS);
    const previousStart = new Date(start.getTime() - 7 * DAY_MS);

    const rows = await this.prisma.$queryRaw<Array<{ bucket: Date; revenueCents: bigint }>>`
      SELECT date_trunc('day', o."closedAt" AT TIME ZONE ${timeZone}) AS "bucket",
             COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents"
      FROM "Order" o
      WHERE o."tenantId" = ${tenantId}
        AND o.status = 'CLOSED'
        AND o."closedAt" >= ${previousStart} AND o."closedAt" < ${end}
      GROUP BY 1
    `;

    const byDay = new Map(
      rows.map((row) => [row.bucket.toISOString().slice(0, 10), Number(row.revenueCents)]),
    );

    const series: AiChatMetricPoint[] = [];
    let current = 0;
    for (let index = 0; index < 7; index += 1) {
      const day = new Date(start.getTime() + index * DAY_MS);
      const key = isoDay(day, timeZone);
      const value = byDay.get(key) ?? 0;
      current += value;
      series.push({ label: formatDate(day, timeZone), valueCents: value });
    }

    let previous = 0;
    for (let index = 0; index < 7; index += 1) {
      const day = new Date(previousStart.getTime() + index * DAY_MS);
      previous += byDay.get(isoDay(day, timeZone)) ?? 0;
    }

    // Sem faturamento nenhum nas duas janelas não há cartão: R$ 0,00 com a
    // sparkline reta é ruído, e o driver tem uma frase melhor para o caso —
    // é o mesmo critério de `inactiveClients` e `agendaToday`.
    if (current === 0 && previous === 0) return null;

    // Sem base de comparação não existe percentual: "∞% acima" seria mentira
    // estatística, então o cartão troca o delta pelo rótulo honesto.
    const deltaPercent = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

    return {
      kind: 'METRIC',
      label: 'Faturamento dos últimos 7 dias',
      valueCents: current,
      deltaPercent,
      deltaLabel: deltaPercent === null ? 'sem base na semana anterior' : 'vs. semana anterior',
      series,
    };
  }

  /** Ticket médio do mês corrente — o cartão que a pergunta de ticket pede. */
  private async averageTicketThisMonth(tenantId: string): Promise<AiChatCard | null> {
    const timeZone = await this.timeZoneOf(tenantId);
    const today = startOfLocalDay(new Date(), timeZone);
    const end = new Date(today.getTime() + DAY_MS);
    const start = new Date(end.getTime() - 30 * DAY_MS);

    const rows = await this.prisma.$queryRaw<
      Array<{ bucket: Date; revenueCents: bigint; orders: bigint }>
    >`
      SELECT date_trunc('day', o."closedAt" AT TIME ZONE ${timeZone}) AS "bucket",
             COALESCE(SUM(o."totalCents"), 0)::bigint AS "revenueCents",
             COUNT(o.id)::bigint AS "orders"
      FROM "Order" o
      WHERE o."tenantId" = ${tenantId}
        AND o.status = 'CLOSED'
        AND o."closedAt" >= ${start} AND o."closedAt" < ${end}
      GROUP BY 1
      ORDER BY 1
    `;

    const totalCents = rows.reduce((sum, row) => sum + Number(row.revenueCents), 0);
    const orders = rows.reduce((sum, row) => sum + Number(row.orders), 0);
    if (orders === 0) return null;

    // A sparkline do ticket é o ticket DE CADA DIA, não o faturamento: um dia
    // de muito movimento não pode parecer um dia de ticket alto.
    const series: AiChatMetricPoint[] = rows.slice(-7).map((row) => ({
      label: formatDate(row.bucket, timeZone),
      valueCents: Number(row.orders) > 0 ? Math.round(Number(row.revenueCents) / Number(row.orders)) : 0,
    }));

    return {
      kind: 'METRIC',
      label: 'Ticket médio (30 dias)',
      valueCents: Math.round(totalCents / orders),
      deltaPercent: null,
      deltaLabel: `${orders} comanda${orders === 1 ? '' : 's'} fechada${orders === 1 ? '' : 's'}`,
      series,
    };
  }

  /**
   * Clientes sem visita há 30+ dias — o MESMO recorte da aba Clientes
   * (`CLIENT_INACTIVE_DAYS`), para os dois números nunca divergirem.
   */
  private async inactiveClients(tenantId: string): Promise<AiChatCard | null> {
    const timeZone = await this.timeZoneOf(tenantId);
    const cutoff = new Date(Date.now() - CLIENT_INACTIVE_DAYS * DAY_MS);

    const where: Prisma.ClientProfileWhereInput = {
      tenantId,
      blocked: false,
      OR: [
        { lastVisitAt: { lt: cutoff } },
        { AND: [{ lastVisitAt: null }, { createdAt: { lt: cutoff } }] },
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.clientProfile.findMany({
        where,
        orderBy: { lastVisitAt: 'desc' },
        take: CARD_ROWS,
        select: {
          id: true,
          lastVisitAt: true,
          createdAt: true,
          client: { select: { name: true } },
        },
      }),
      this.prisma.clientProfile.count({ where }),
    ]);

    if (total === 0) return null;

    const clients: AiChatClientRow[] = rows.map((row) => ({
      clientProfileId: row.id,
      name: row.client.name,
      initials: initialsOf(row.client.name),
      lastVisitLabel: row.lastVisitAt ? formatDate(row.lastVisitAt, timeZone) : 'nunca veio',
    }));

    return {
      kind: 'CLIENT_LIST',
      title: `Encontrei ${total} cliente${total === 1 ? '' : 's'} sem visita há mais de ${CLIENT_INACTIVE_DAYS} dias:`,
      clients,
      total,
      action: 'REACTIVATION',
      actionLabel: 'Enviar reativação para todos',
    };
  }

  /** Agendamentos de hoje que ainda valem (agendado/confirmado/atendido). */
  private async agendaToday(tenantId: string): Promise<AiChatCard | null> {
    const timeZone = await this.timeZoneOf(tenantId);
    const start = startOfLocalDay(new Date(), timeZone);
    const end = new Date(start.getTime() + DAY_MS);

    const where: Prisma.AppointmentWhereInput = {
      tenantId,
      startsAt: { gte: start, lt: end },
      status: {
        in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.DONE],
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        take: CARD_ROWS,
        select: {
          id: true,
          startsAt: true,
          guestName: true,
          client: { select: { name: true } },
          service: { select: { name: true } },
          barber: { select: { name: true } },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    if (total === 0) return null;

    const appointments: AiChatAppointmentRow[] = rows.map((row) => ({
      appointmentId: row.id,
      clientName: row.client?.name ?? row.guestName ?? 'Sem cadastro',
      serviceName: row.service.name,
      barberName: row.barber.name,
      whenLabel: formatDateTime(row.startsAt, timeZone),
      date: isoDay(row.startsAt, timeZone),
    }));

    return {
      kind: 'AGENDA',
      title: `${total} atendimento${total === 1 ? '' : 's'} na agenda de hoje`,
      appointments,
      total,
      date: isoDay(start, timeZone),
    };
  }
}
