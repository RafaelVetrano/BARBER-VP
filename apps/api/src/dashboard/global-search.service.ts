import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeMobilePhone, type GlobalSearchResponse } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import type { StaffScope } from '../staff-agenda/staff-scope.service';

const PER_GROUP = 5;

/**
 * Busca global da topbar (Ctrl+K) — clientes, agendamentos e serviços.
 *
 * Três consultas paralelas, cada uma limitada a 5 linhas: é uma caixa de
 * sugestão, não uma listagem. Quem quer a lista inteira vai para a tela.
 *
 * Dois recortes, iguais aos do resto do painel:
 * - `BARBER` não recebe a base de clientes (`ClientsController` já é
 *   `@Roles('OWNER','MANAGER')`); recebe os PRÓPRIOS agendamentos, onde o nome
 *   do cliente aparece de qualquer forma — mas só o de quem ele atende.
 * - Nome de cliente com dígitos vira busca por telefone normalizado, porque é
 *   assim que o balcão procura de verdade.
 */
@Injectable()
export class GlobalSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(tenantId: string, scope: StaffScope, rawQuery: string): Promise<GlobalSearchResponse> {
    const query = rawQuery.trim();
    const barberId = scope.forcedBarberId;
    const digits = query.replace(/\D/g, '');
    const phoneFragment = digits.length >= 4 ? digits : null;

    const nameFilter: Prisma.StringFilter = { contains: query, mode: 'insensitive' };

    const [clients, appointments, services] = await Promise.all([
      barberId
        ? Promise.resolve([])
        : this.prisma.clientProfile.findMany({
            where: {
              tenantId,
              deletedAt: null,
              OR: [
                { client: { name: nameFilter } },
                ...(phoneFragment ? [{ phone: { contains: normalizedFragment(phoneFragment) } }] : []),
              ],
            },
            select: { client: { select: { id: true, name: true, phone: true } } },
            orderBy: { lastVisitAt: 'desc' },
            take: PER_GROUP,
          }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          ...(barberId ? { barberId } : {}),
          OR: [
            { client: { name: nameFilter } },
            { guestName: nameFilter },
            { bookingCode: { contains: query, mode: 'insensitive' } },
            ...(phoneFragment ? [{ guestPhone: { contains: normalizedFragment(phoneFragment) } }] : []),
          ],
        },
        select: {
          id: true,
          startsAt: true,
          status: true,
          guestName: true,
          client: { select: { name: true } },
          barber: { select: { name: true } },
          service: { select: { name: true } },
        },
        orderBy: { startsAt: 'desc' },
        take: PER_GROUP,
      }),
      this.prisma.service.findMany({
        where: { tenantId, deletedAt: null, active: true, name: nameFilter },
        select: { id: true, name: true, priceCents: true, durationMin: true },
        orderBy: { name: 'asc' },
        take: PER_GROUP,
      }),
    ]);

    const clientItems = clients.map((row) => ({
      id: row.client.id,
      name: row.client.name,
      phone: row.client.phone,
    }));
    const appointmentItems = appointments.map((row) => ({
      id: row.id,
      clientName: row.client?.name ?? row.guestName ?? 'Sem cadastro',
      serviceName: row.service.name,
      barberName: row.barber.name,
      startsAt: row.startsAt.toISOString(),
      status: row.status,
    }));

    return {
      query,
      clients: clientItems,
      appointments: appointmentItems,
      services,
      total: clientItems.length + appointmentItems.length + services.length,
    };
  }
}

/**
 * Telefone é guardado em E.164 sem formatação. Quem digita "98765" quer casar
 * o miolo do número, então o fragmento vai cru; quem digita o número inteiro
 * ganha a normalização completa (com DDI) para casar do começo.
 */
function normalizedFragment(digits: string): string {
  if (digits.length < 10) {
    return digits;
  }
  return normalizeMobilePhone(digits) ?? digits;
}
