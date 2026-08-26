import { Injectable } from '@nestjs/common';
import { MembershipRole, type Prisma } from '@prisma/client';
import type {
  BarberListItem,
  ScheduleExceptionItem,
  TeamPlanUsage,
  WorkScheduleDay,
} from '@barbervp/types';
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
  // O card do protótipo mostra as pílulas com o NOME do serviço (l.2065), não
  // uma contagem — sem o join a tela teria de cruzar a lista de serviços por
  // fora, e o `BARBER` que abre a agenda não tem `/services`.
  barberServices: {
    select: { serviceId: true, service: { select: { name: true } } },
    orderBy: { service: { name: 'asc' as const } },
  },
  workSchedules: { orderBy: { weekday: 'asc' as const } },
  commissionRule: { select: { id: true, type: true, percentBps: true } },
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

  /** Cabeçalho "Barbeiros: X de Y" e banner de downgrade (protótipo l.2025/2043). */
  planUsage(tenantId: string): Promise<TeamPlanUsage> {
    return this.planLimits.usage(tenantId);
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
          phone: normalizePhoneOrThrow(dto.phone),
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

    // Reativar ocupa uma vaga igual a contratar. Sem esta guarda, o dono
    // faria downgrade e desfaria o efeito dele com um clique em "Reativar".
    if (dto.active === true && !existing.active) {
      await this.planLimits.assertCanAddBarber(tenantId);
    }

    if (dto.schedule) {
      assertScheduleIsCoherent(dto.schedule);
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

      if (dto.schedule) {
        await writeWeek(tx, tenantId, barberId, dto.schedule);
      }

      return tx.barber.update({
        where: { id: barberId },
        data: {
          name: dto.name?.trim(),
          specialty: dto.specialty === undefined ? undefined : dto.specialty,
          phone: dto.phone === undefined ? undefined : normalizePhoneOrThrow(dto.phone),
          email: dto.email === undefined ? undefined : dto.email,
          avatarUrl: dto.avatarUrl === undefined ? undefined : dto.avatarUrl,
          active: dto.active,
          // Reativado na mão deixa de ser "inativo pelo plano": o próximo
          // downgrade volta a escolher os excedentes do zero.
          inactiveByPlan: dto.active === undefined ? undefined : false,
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
    assertScheduleIsCoherent(dto.days);

    await this.prisma.$transaction((tx) => writeWeek(tx, tenantId, barberId, dto.days));

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
    inactiveByPlan: barber.inactiveByPlan,
    isOwner: barber.userId !== null && ownerUserIds.has(barber.userId),
    hasLogin: barber.userId !== null,
    serviceIds: barber.barberServices.map((link) => link.serviceId),
    serviceNames: barber.barberServices.map((link) => link.service.name),
    commissionRuleId: barber.commissionRuleId,
    commissionLabel: commissionLabelOf(barber.commissionRule),
    workSchedule: fillWeek(barber.workSchedules),
  };
}

/**
 * A linha "Comissão" do card (l.2078).
 *
 * A regra por FAIXAS não cabe num número — mostrar a primeira faixa daria a
 * impressão de que o barbeiro ganha aquilo sempre. O card diz "Por faixas" e o
 * detalhe fica na aba Comissões, para onde o modal manda por link.
 */
function commissionLabelOf(
  rule: { type: string; percentBps: number | null } | null,
): string | null {
  if (!rule) {
    return null;
  }
  if (rule.type === 'TIERED') {
    return 'Por faixas';
  }
  const percent = (rule.percentBps ?? 0) / 100;
  return `${percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
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

/**
 * WhatsApp digitado pela metade **recusa**, não vira `null`.
 *
 * `normalizeMobilePhone` devolve `null` tanto para "campo vazio" quanto para
 * "número inválido", e tratar os dois igual apagava em silêncio o telefone de
 * quem errou um dígito ao editar o cadastro.
 */
function normalizePhoneOrThrow(input: string | null | undefined): string | null {
  if (!input || input.trim() === '') {
    return null;
  }
  const normalized = normalizeMobilePhone(input);
  if (!normalized) {
    throw ApiException.badRequest('WhatsApp inválido. Use DDD + 9 dígitos.');
  }
  return normalized;
}

/**
 * A semana como chega do DTO: `lunchStart`/`lunchEnd` podem vir OMITIDOS (o
 * dia sem almoço), enquanto o contrato de leitura sempre devolve `null`. As
 * duas funções abaixo aceitam a forma frouxa e normalizam na gravação.
 */
type ScheduleInput = Array<
  Omit<WorkScheduleDay, 'lunchStart' | 'lunchEnd'> & {
    lunchStart?: number | null;
    lunchEnd?: number | null;
  }
>;

/**
 * Valida a semana ANTES de gravar qualquer linha.
 *
 * A checagem é feita inteira de uma vez, e não dia a dia dentro do laço de
 * escrita: metade da semana salva e a outra metade recusada deixaria a escala
 * do barbeiro num estado que ninguém pediu.
 */
function assertScheduleIsCoherent(days: ScheduleInput): void {
  for (const day of days) {
    if (day.isDayOff) {
      continue;
    }
    if (day.endTime <= day.startTime) {
      throw ApiException.badRequest('O horário de fim precisa ser depois do início.');
    }
    if (day.lunchStart == null || day.lunchEnd == null) {
      continue;
    }
    if (day.lunchEnd <= day.lunchStart) {
      throw ApiException.badRequest('O intervalo de almoço precisa terminar depois de começar.');
    }
    if (day.lunchStart < day.startTime || day.lunchEnd > day.endTime) {
      throw ApiException.badRequest('O almoço precisa caber dentro do expediente do dia.');
    }
  }
}

/** Grava a semana toda (upsert por dia). Usado pelo `PUT` e pelo modal. */
async function writeWeek(
  tx: Prisma.TransactionClient,
  tenantId: string,
  barberId: string,
  days: ScheduleInput,
): Promise<void> {
  for (const day of days) {
    // Folga guarda `startTime + 1` porque a coluna não é anulável e o
    // `CHECK` do banco exige fim depois do início; quem lê olha `isDayOff`.
    const endTime = day.isDayOff ? day.startTime + 1 : day.endTime;
    const data = {
      startTime: day.startTime,
      endTime,
      lunchStart: day.isDayOff ? null : (day.lunchStart ?? null),
      lunchEnd: day.isDayOff ? null : (day.lunchEnd ?? null),
      isDayOff: day.isDayOff,
    };
    await tx.workSchedule.upsert({
      where: { barberId_weekday: { barberId, weekday: day.weekday } },
      create: { tenantId, barberId, weekday: day.weekday, ...data },
      update: data,
    });
  }
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
