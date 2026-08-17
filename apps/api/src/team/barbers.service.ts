import { Injectable } from '@nestjs/common';
import { MembershipRole, type Prisma } from '@prisma/client';
import type { BarberListItem, ScheduleExceptionItem, WorkScheduleDay } from '@barbervp/types';
import { normalizeMobilePhone } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/types/request-context';
import { PlanLimitsService } from './plan-limits.service';
import type {
  CreateBarberDto,
  CreateScheduleExceptionDto,
  UpdateBarberDto,
  UpdateWorkScheduleDto,
} from './dto/team.dto';

const BARBER_INCLUDE = {
  barberServices: { select: { serviceId: true } },
  workSchedules: { orderBy: { weekday: 'asc' as const } },
} satisfies Prisma.BarberInclude;

type BarberRow = Prisma.BarberGetPayload<{ include: typeof BARBER_INCLUDE }>;

/** CRUD de `Barber`, escala semanal (`WorkSchedule`) e exceções (tela Equipe). */
@Injectable()
export class BarbersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async list(tenantId: string): Promise<BarberListItem[]> {
    const [barbers, ownerUserIds] = await Promise.all([
      this.prisma.barber.findMany({
        where: { tenantId, deletedAt: null },
        include: BARBER_INCLUDE,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.membership
        .findMany({
          where: { tenantId, role: MembershipRole.OWNER, active: true },
          select: { userId: true },
        })
        .then((rows) => new Set(rows.map((row) => row.userId))),
    ]);

    return barbers.map((barber) => toListItem(barber, ownerUserIds));
  }

  /** Adiciona um barbeiro SEM login (o dono/gerente atende os pedidos dele por fora). */
  async create(
    tenantId: string,
    dto: CreateBarberDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<BarberListItem> {
    await this.planLimits.assertCanAddBarber(tenantId);
    await this.assertServicesBelongToTenant(tenantId, dto.serviceIds);

    const count = await this.prisma.barber.count({ where: { tenantId, deletedAt: null } });

    const created = await this.prisma.$transaction(async (tx) => {
      const barber = await tx.barber.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          specialty: dto.specialty ?? null,
          phone: dto.phone ? normalizeMobilePhone(dto.phone) : null,
          sortOrder: count,
          barberServices: dto.serviceIds
            ? { create: dto.serviceIds.map((serviceId) => ({ tenantId, serviceId })) }
            : undefined,
        },
        include: BARBER_INCLUDE,
      });

      await this.copyBusinessHours(tx, tenantId, barber.id);

      return tx.barber.findUniqueOrThrow({ where: { id: barber.id }, include: BARBER_INCLUDE });
    });

    await this.audit.record(
      {
        action: AuditAction.BARBER_CREATED,
        entity: 'Barber',
        entityId: created.id,
        tenantId,
        actorUserId,
        metadata: { name: created.name },
      },
      request,
    );

    return toListItem(created, await this.ownerUserIds(tenantId));
  }

  async update(
    tenantId: string,
    barberId: string,
    dto: UpdateBarberDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<BarberListItem> {
    const existing = await this.loadOwned(tenantId, barberId);
    await this.assertServicesBelongToTenant(tenantId, dto.serviceIds);

    if (dto.active === false && (await this.isOwnerBarber(tenantId, existing))) {
      throw ApiException.badRequest('O barbeiro-dono não pode ser desativado.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.serviceIds) {
        await tx.barberService.deleteMany({ where: { tenantId, barberId } });
        if (dto.serviceIds.length > 0) {
          await tx.barberService.createMany({
            data: dto.serviceIds.map((serviceId) => ({ tenantId, barberId, serviceId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.barber.update({
        where: { id: barberId },
        data: {
          name: dto.name?.trim(),
          specialty: dto.specialty === undefined ? undefined : dto.specialty,
          phone: dto.phone === undefined ? undefined : dto.phone ? normalizeMobilePhone(dto.phone) : null,
          email: dto.email === undefined ? undefined : dto.email,
          active: dto.active,
        },
        include: BARBER_INCLUDE,
      });
    });

    await this.audit.record(
      {
        action:
          dto.active === false ? AuditAction.BARBER_DEACTIVATED : AuditAction.BARBER_UPDATED,
        entity: 'Barber',
        entityId: updated.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return toListItem(updated, await this.ownerUserIds(tenantId));
  }

  async getWorkSchedule(tenantId: string, barberId: string): Promise<WorkScheduleDay[]> {
    await this.loadOwned(tenantId, barberId);
    const rows = await this.prisma.workSchedule.findMany({
      where: { tenantId, barberId },
      orderBy: { weekday: 'asc' },
    });
    return fillWeek(rows);
  }

  async updateWorkSchedule(
    tenantId: string,
    barberId: string,
    dto: UpdateWorkScheduleDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<WorkScheduleDay[]> {
    await this.loadOwned(tenantId, barberId);

    for (const day of dto.days) {
      if (!day.isDayOff && day.endTime <= day.startTime) {
        throw ApiException.badRequest('O horário de fim precisa ser depois do início.');
      }
      if (day.lunchStart !== undefined && day.lunchEnd !== undefined && day.lunchStart !== null && day.lunchEnd !== null) {
        if (day.lunchEnd <= day.lunchStart) {
          throw ApiException.badRequest('O intervalo de almoço precisa terminar depois de começar.');
        }
      }
    }

    await this.prisma.$transaction(
      dto.days.map((day) =>
        this.prisma.workSchedule.upsert({
          where: { barberId_weekday: { barberId, weekday: day.weekday } },
          create: {
            tenantId,
            barberId,
            weekday: day.weekday,
            startTime: day.startTime,
            endTime: day.isDayOff ? day.startTime + 1 : day.endTime,
            lunchStart: day.lunchStart ?? null,
            lunchEnd: day.lunchEnd ?? null,
            isDayOff: day.isDayOff,
          },
          update: {
            startTime: day.startTime,
            endTime: day.isDayOff ? day.startTime + 1 : day.endTime,
            lunchStart: day.lunchStart ?? null,
            lunchEnd: day.lunchEnd ?? null,
            isDayOff: day.isDayOff,
          },
        }),
      ),
    );

    await this.audit.record(
      {
        action: AuditAction.WORK_SCHEDULE_UPDATED,
        entity: 'Barber',
        entityId: barberId,
        tenantId,
        actorUserId,
      },
      request,
    );

    return this.getWorkSchedule(tenantId, barberId);
  }

  async listScheduleExceptions(tenantId: string, barberId?: string): Promise<ScheduleExceptionItem[]> {
    const rows = await this.prisma.scheduleException.findMany({
      where: { tenantId, ...(barberId ? { barberId } : {}) },
      orderBy: { startDate: 'desc' },
    });
    return rows.map(toExceptionItem);
  }

  async createScheduleException(
    tenantId: string,
    dto: CreateScheduleExceptionDto,
    actorUserId: string,
    request: RequestContext,
  ): Promise<ScheduleExceptionItem> {
    if (dto.barberId) {
      await this.loadOwned(tenantId, dto.barberId);
    }
    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw ApiException.badRequest('A data final precisa ser igual ou depois da inicial.');
    }

    const created = await this.prisma.scheduleException.create({
      data: {
        tenantId,
        barberId: dto.barberId ?? null,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        type: dto.type,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        reason: dto.reason ?? null,
      },
    });

    await this.audit.record(
      {
        action: AuditAction.SCHEDULE_EXCEPTION_CREATED,
        entity: 'ScheduleException',
        entityId: created.id,
        tenantId,
        actorUserId,
      },
      request,
    );

    return toExceptionItem(created);
  }

  async deleteScheduleException(
    tenantId: string,
    id: string,
    actorUserId: string,
    request: RequestContext,
  ): Promise<void> {
    const existing = await this.prisma.scheduleException.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw ApiException.notFound('Exceção não encontrada.');
    }

    await this.prisma.scheduleException.delete({ where: { id } });

    await this.audit.record(
      {
        action: AuditAction.SCHEDULE_EXCEPTION_DELETED,
        entity: 'ScheduleException',
        entityId: id,
        tenantId,
        actorUserId,
      },
      request,
    );
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  async loadOwned(tenantId: string, barberId: string): Promise<BarberRow> {
    const barber = await this.prisma.barber.findFirst({
      where: { id: barberId, tenantId, deletedAt: null },
      include: BARBER_INCLUDE,
    });
    if (!barber) {
      throw ApiException.notFound('Barbeiro não encontrado.');
    }
    return barber;
  }

  private async isOwnerBarber(tenantId: string, barber: BarberRow): Promise<boolean> {
    if (!barber.userId) {
      return false;
    }
    const owners = await this.ownerUserIds(tenantId);
    return owners.has(barber.userId);
  }

  private async ownerUserIds(tenantId: string): Promise<Set<string>> {
    const rows = await this.prisma.membership.findMany({
      where: { tenantId, role: MembershipRole.OWNER, active: true },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  private async assertServicesBelongToTenant(tenantId: string, serviceIds?: string[]): Promise<void> {
    if (!serviceIds || serviceIds.length === 0) {
      return;
    }
    const count = await this.prisma.service.count({
      where: { id: { in: serviceIds }, tenantId, deletedAt: null },
    });
    if (count !== serviceIds.length) {
      throw ApiException.badRequest('Um dos serviços selecionados não pertence a esta barbearia.');
    }
  }

  /** Copia `TenantBusinessHour` para o `WorkSchedule` do barbeiro recém-criado. */
  private async copyBusinessHours(
    tx: Prisma.TransactionClient,
    tenantId: string,
    barberId: string,
  ): Promise<void> {
    const hours = await tx.tenantBusinessHour.findMany({ where: { tenantId } });
    if (hours.length === 0) {
      return;
    }
    await tx.workSchedule.createMany({
      data: hours.map((hour) => ({
        tenantId,
        barberId,
        weekday: hour.weekday,
        startTime: hour.opensAt,
        endTime: hour.closed ? hour.opensAt + 1 : hour.closesAt,
        isDayOff: hour.closed,
      })),
      skipDuplicates: true,
    });
  }
}

function toListItem(barber: BarberRow, ownerUserIds: Set<string>): BarberListItem {
  return {
    id: barber.id,
    name: barber.name,
    specialty: barber.specialty,
    avatarUrl: barber.avatarUrl,
    phone: barber.phone,
    email: barber.email,
    active: barber.active,
    isOwner: barber.userId !== null && ownerUserIds.has(barber.userId),
    hasLogin: barber.userId !== null,
    serviceIds: barber.barberServices.map((link) => link.serviceId),
    workSchedule: fillWeek(barber.workSchedules),
  };
}

function toExceptionItem(row: {
  id: string;
  barberId: string | null;
  startDate: Date;
  endDate: Date;
  type: string;
  startTime: number | null;
  endTime: number | null;
  reason: string | null;
}): ScheduleExceptionItem {
  return {
    id: row.id,
    barberId: row.barberId,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    type: row.type as ScheduleExceptionItem['type'],
    startTime: row.startTime,
    endTime: row.endTime,
    reason: row.reason,
  };
}

/** Preenche os 7 dias — um `weekday` sem linha em `WorkSchedule` é folga. */
function fillWeek(
  rows: Array<{
    weekday: number;
    startTime: number;
    endTime: number;
    lunchStart: number | null;
    lunchEnd: number | null;
    isDayOff: boolean;
  }>,
): WorkScheduleDay[] {
  const byWeekday = new Map(rows.map((row) => [row.weekday, row]));
  return Array.from({ length: 7 }, (_, weekday) => {
    const row = byWeekday.get(weekday);
    return {
      weekday,
      startTime: row?.startTime ?? 540,
      endTime: row?.endTime ?? 1200,
      lunchStart: row?.lunchStart ?? null,
      lunchEnd: row?.lunchEnd ?? null,
      isDayOff: row?.isDayOff ?? true,
    };
  });
}
