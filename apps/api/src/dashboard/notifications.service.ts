import { Injectable } from '@nestjs/common';
import { AppointmentStatus, CashRegisterStatus } from '@prisma/client';
import { formatBRL, hasFeature, type NotificationItem, type NotificationsResponse } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { addDays, toMinutesOfDay } from '../common/utils/timezone';
import type { StaffScope } from '../staff-agenda/staff-scope.service';
import { dayRange, todayKey } from './dashboard-window';

const RECENT_LIMIT = 5;
const FEED_LIMIT = 12;

/**
 * Sino da topbar.
 *
 * O feed é DERIVADO de fatos que já existem no banco (confirmações e
 * cancelamentos de hoje, contas vencendo, caixa fechado, estoque no mínimo),
 * não de uma tabela `Notification`. A razão é escopo: persistir aviso exige
 * escrever em toda ação do produto e guardar estado de leitura por usuário —
 * trabalho de uma fase inteira, não de uma auditoria de tela. Enquanto isso, o
 * sino mostra dado real em vez de mock, e o contador é o número de pendências
 * abertas, não "não lidas" (ver CONTEXT.md → dívidas da fase 13).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, scope: StaffScope): Promise<NotificationsResponse> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { timezone: true, plan: { select: { features: true } } },
    });

    if (!tenant) {
      throw ApiException.notFound('Barbearia não encontrada.');
    }

    const tz = tenant.timezone;
    const today = todayKey(tz);
    const window = dayRange(today, tz);
    const barberId = scope.forcedBarberId;
    const isManager = barberId === null;
    const seesBills = isManager && hasFeature(tenant.plan?.features, 'contasPagarReceber');

    const [appointments, dueBills, openRegister, lowStock] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          ...(barberId ? { barberId } : {}),
          status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELED] },
          updatedAt: { gte: window.from, lt: window.to },
        },
        orderBy: { updatedAt: 'desc' },
        take: RECENT_LIMIT,
        select: {
          id: true,
          status: true,
          startsAt: true,
          updatedAt: true,
          guestName: true,
          client: { select: { name: true } },
        },
      }),
      seesBills
        ? this.prisma.accountPayable.findMany({
            where: {
              tenantId,
              deletedAt: null,
              status: 'PENDING',
              dueDate: {
                gte: new Date(`${today}T00:00:00.000Z`),
                lte: new Date(`${addDays(today, 7)}T00:00:00.000Z`),
              },
            },
            orderBy: { dueDate: 'asc' },
            take: RECENT_LIMIT,
            select: { id: true, description: true, amountCents: true, dueDate: true },
          })
        : Promise.resolve([]),
      isManager
        ? this.prisma.cashRegister.count({ where: { tenantId, status: CashRegisterStatus.OPEN } })
        : Promise.resolve(1),
      isManager
        ? this.prisma.$queryRaw<Array<{ total: bigint }>>`
            SELECT COUNT(*)::bigint AS "total"
            FROM "Product" p
            WHERE p."tenantId" = ${tenantId}
              AND p."deletedAt" IS NULL
              AND p.active = true
              AND p.stock <= p."estoqueMin"
          `
        : Promise.resolve([{ total: 0n }]),
    ]);

    const items: NotificationItem[] = [];

    for (const appointment of appointments) {
      const who = appointment.client?.name ?? appointment.guestName ?? 'Cliente sem cadastro';
      const clock = formatClock(appointment.startsAt, tz);
      items.push(
        appointment.status === AppointmentStatus.CONFIRMED
          ? {
              id: `appt-${appointment.id}`,
              kind: 'APPOINTMENT_CONFIRMED',
              text: `${who} confirmou o horário de ${clock}`,
              createdAt: appointment.updatedAt.toISOString(),
              href: '/app/agenda',
            }
          : {
              id: `appt-${appointment.id}`,
              kind: 'APPOINTMENT_CANCELED',
              text: `${who} cancelou o horário de ${clock}`,
              createdAt: appointment.updatedAt.toISOString(),
              href: '/app/agenda',
            },
      );
    }

    for (const bill of dueBills) {
      items.push({
        id: `bill-${bill.id}`,
        kind: 'BILL_DUE',
        text: `Conta "${bill.description}" vence em ${formatDay(bill.dueDate)} (${formatBRL(bill.amountCents)})`,
        createdAt: bill.dueDate.toISOString(),
        href: '/app/financeiro',
      });
    }

    if (openRegister === 0) {
      items.push({
        id: `cash-${today}`,
        kind: 'CASH_REGISTER_CLOSED',
        text: 'Caixa ainda não foi aberto hoje',
        createdAt: window.from.toISOString(),
        href: '/app/financeiro',
      });
    }

    const lowStockCount = Number(lowStock[0]?.total ?? 0);
    if (lowStockCount > 0) {
      items.push({
        id: `stock-${today}`,
        kind: 'LOW_STOCK',
        text:
          lowStockCount === 1
            ? '1 produto está no estoque mínimo'
            : `${lowStockCount} produtos estão no estoque mínimo`,
        createdAt: window.from.toISOString(),
        href: '/app/servicos-produtos',
      });
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limited = items.slice(0, FEED_LIMIT);

    return { items: limited, count: limited.length };
  }
}

function formatClock(instant: Date, tz: string): string {
  const minutes = toMinutesOfDay(instant, tz);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}h${minutes % 60 === 0 ? '' : String(minutes % 60).padStart(2, '0')}`;
}

/** `dd/MM` — a coluna é `@db.Date`, então o dia já vem sem hora. */
function formatDay(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
