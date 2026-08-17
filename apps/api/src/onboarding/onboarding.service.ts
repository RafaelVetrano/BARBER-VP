import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_BUSINESS_HOURS,
  ErrorCode,
  ONBOARDING_STEPS,
  SUGGESTED_SERVICES,
  formatPhone,
  isValidSlug,
  normalizePhone,
  type OnboardingState,
  type SlugAvailability,
} from '@barbervp/types';
import { CONFIG, type AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { AuditAction, AuditService } from '../audit/audit.service';
import { SlugService } from '../tenants/slug.service';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import type {
  OnboardingBusinessHoursDto,
  OnboardingIdentityDto,
  OnboardingLocationDto,
  OnboardingProfileDto,
  OnboardingServicesDto,
  OnboardingTeamDto,
} from './dto/onboarding.dto';

/** Faixas de plano que o texto do passo 5 anuncia (informativo no trial). */
function planTierFor(barbers: number): OnboardingState['planHint']['tier'] {
  if (barbers <= 2) return 'Essencial';
  if (barbers <= 4) return 'Profissional';
  return 'Avançado';
}

/**
 * Wizard "Configurar Barbearia" — os 6 passos reais do protótipo.
 *
 * Cada passo é um endpoint próprio que grava e avança
 * `TenantSettings.onboardingStep`, então o wizard é retomável: fechar o
 * navegador no passo 4 e voltar amanhã, de outro aparelho, continua dali.
 *
 * Todo método recebe o tenant já resolvido pelo `TenantGuard` (a partir do
 * JWT). Nenhum aceita `tenantId` — é a regra 3.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugs: SlugService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  // ── Leitura ───────────────────────────────────────────────────────────────

  async getState(tenantId: string, principal: AuthPrincipal): Promise<OnboardingState> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        settings: true,
        businessHours: { orderBy: { weekday: 'asc' } },
        services: {
          where: { deletedAt: null, active: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, name: true, durationMin: true, priceCents: true },
        },
        barbers: {
          where: { deletedAt: null, active: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, name: true, phone: true, userId: true },
        },
      },
    });

    if (!tenant) {
      throw ApiException.notFound('Barbearia não encontrada.');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: principal.id },
      select: { name: true },
    });

    const settings = tenant.settings;
    // Passo 4 nunca abre vazio: sem serviço nenhum, a tela mostra as sugestões
    // que o protótipo pré-popula — vindas da API, não de array no cliente.
    const services =
      tenant.services.length > 0 ? tenant.services : SUGGESTED_SERVICES.map((service) => ({ ...service }));

    const businessHours =
      tenant.businessHours.length > 0
        ? tenant.businessHours.map(({ weekday, opensAt, closesAt, closed }) => ({
            weekday,
            opensAt,
            closesAt,
            closed,
          }))
        : DEFAULT_BUSINESS_HOURS.map((hour) => ({ ...hour }));

    return {
      step: settings?.onboardingStep ?? 0,
      completed: Boolean(settings?.onboardingDoneAt),
      ownerFirstName: (owner?.name ?? '').split(' ')[0] ?? '',
      publicUrl: this.publicUrl(tenant.slug),
      profile: {
        name: tenant.name,
        phone: tenant.phone ? formatPhone(tenant.phone) : null,
        instagram: settings?.instagram ?? null,
        description: settings?.sobre ?? null,
      },
      location: {
        zip: settings?.addressZip ?? null,
        street: settings?.addressStreet ?? null,
        number: settings?.addressNumber ?? null,
        complement: settings?.addressComplement ?? null,
        neighborhood: settings?.addressNeighborhood ?? null,
        city: settings?.addressCity ?? null,
        state: settings?.addressState ?? null,
      },
      identity: {
        slug: tenant.slug,
        logoUrl: settings?.logoUrl ?? null,
        coverUrl: settings?.coverUrl ?? null,
      },
      services,
      barbers: tenant.barbers.map((barber) => ({
        id: barber.id,
        name: barber.name,
        phone: barber.phone ? formatPhone(barber.phone) : null,
        isOwner: barber.userId === principal.id,
      })),
      businessHours,
      planHint: {
        barbers: tenant.barbers.length,
        tier: planTierFor(tenant.barbers.length),
      },
    };
  }

  checkSlug(slug: string, tenantId: string): Promise<SlugAvailability> {
    return this.slugs.checkAvailability(slug, tenantId);
  }

  // ── Passos ────────────────────────────────────────────────────────────────

  /** Passo 1 — nome, telefone, Instagram, descrição (até 200 caracteres). */
  async saveProfile(
    tenantId: string,
    dto: OnboardingProfileDto,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<OnboardingState> {
    const phone = normalizePhone(dto.phone);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { name: dto.name, phone },
      });
      await this.upsertSettings(tx, tenantId, {
        instagram: dto.instagram || null,
        sobre: dto.description || null,
        whatsapp: phone,
      });
    });

    await this.advance(tenantId, 1);
    await this.recordSettingsChange(tenantId, principal, request, 'profile');
    return this.getState(tenantId, principal);
  }

  /** Passo 2 — endereço estruturado + a linha única que a página pública mostra. */
  async saveLocation(
    tenantId: string,
    dto: OnboardingLocationDto,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<OnboardingState> {
    await this.upsertSettings(this.prisma, tenantId, {
      addressZip: dto.zip ?? null,
      addressStreet: dto.street,
      addressNumber: dto.number,
      addressComplement: dto.complement ?? null,
      addressNeighborhood: dto.neighborhood ?? null,
      addressCity: dto.city,
      addressState: dto.state,
      address: formatAddressLine(dto),
    });

    await this.advance(tenantId, 2);
    await this.recordSettingsChange(tenantId, principal, request, 'location');
    return this.getState(tenantId, principal);
  }

  /** Passo 3 — logo, capa e slug público (pulável). */
  async saveIdentity(
    tenantId: string,
    dto: OnboardingIdentityDto,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<OnboardingState> {
    const slug = this.slugs.normalize(dto.slug);

    if (!isValidSlug(slug)) {
      throw ApiException.badRequest('Link inválido — use letras, números e hífen.');
    }

    const availability = await this.slugs.checkAvailability(slug, tenantId);
    if (!availability.available) {
      throw ApiException.conflict('Este link já está em uso.', ErrorCode.SLUG_IN_USE);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { slug } });
      await this.upsertSettings(tx, tenantId, {
        logoUrl: dto.logoUrl ?? null,
        coverUrl: dto.coverUrl ?? null,
      });
    });

    await this.advance(tenantId, 3);
    await this.recordSettingsChange(tenantId, principal, request, 'identity');
    return this.getState(tenantId, principal);
  }

  /**
   * Passo 4 — serviços em lote. A lista enviada passa a ser a verdade: o que
   * tem `id` é atualizado, o que não tem é criado, e o que sumiu é desativado
   * (soft delete, porque agendamento e comanda referenciam `Service`).
   */
  async saveServices(
    tenantId: string,
    dto: OnboardingServicesDto,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<OnboardingState> {
    assertUniqueNames(dto.services.map((service) => service.name), 'serviço');

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.service.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true },
      });
      const keptIds = new Set(dto.services.map((service) => service.id).filter(Boolean) as string[]);

      for (const [index, service] of dto.services.entries()) {
        if (service.id && existing.some((row) => row.id === service.id)) {
          await tx.service.update({
            where: { id: service.id },
            data: {
              name: service.name,
              durationMin: service.durationMin,
              priceCents: service.priceCents,
              sortOrder: index,
              active: true,
            },
          });
        } else {
          const created = await tx.service.create({
            data: {
              tenantId,
              name: service.name,
              durationMin: service.durationMin,
              priceCents: service.priceCents,
              sortOrder: index,
            },
            select: { id: true },
          });
          keptIds.add(created.id);
        }
      }

      const removed = existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
      if (removed.length > 0) {
        await tx.service.updateMany({
          where: { id: { in: removed }, tenantId },
          data: { active: false, deletedAt: new Date() },
        });
      }

      // Todo barbeiro ativo atende todo serviço ativo no fim do onboarding —
      // o ajuste fino de "quem faz o quê" é tela da fase 06.
      await this.syncBarberServices(tx, tenantId);
    });

    await this.advance(tenantId, 4);
    await this.recordSettingsChange(tenantId, principal, request, 'services');
    return this.getState(tenantId, principal);
  }

  /**
   * Passo 5 — equipe em lote (pulável). O barbeiro do dono não vem no payload e
   * nunca é removido: é a linha fixa "Você" do protótipo.
   */
  async saveTeam(
    tenantId: string,
    dto: OnboardingTeamDto,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<OnboardingState> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.barber.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, userId: true },
      });
      const ownerBarberIds = new Set(
        existing.filter((barber) => barber.userId !== null).map((barber) => barber.id),
      );
      const keptIds = new Set(ownerBarberIds);

      for (const [index, barber] of dto.barbers.entries()) {
        const phone = barber.phone ? normalizePhone(barber.phone) : null;
        const isExisting = barber.id && existing.some((row) => row.id === barber.id);

        if (isExisting) {
          await tx.barber.update({
            where: { id: barber.id },
            data: { name: barber.name, phone, sortOrder: index + 1, active: true },
          });
          keptIds.add(barber.id!);
        } else {
          const created = await tx.barber.create({
            data: { tenantId, name: barber.name, phone, sortOrder: index + 1 },
            select: { id: true },
          });
          keptIds.add(created.id);
        }
      }

      const removed = existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
      if (removed.length > 0) {
        await tx.barber.updateMany({
          where: { id: { in: removed }, tenantId },
          data: { active: false, deletedAt: new Date() },
        });
      }

      await this.syncBarberServices(tx, tenantId);
    });

    await this.advance(tenantId, 5);
    await this.recordSettingsChange(tenantId, principal, request, 'team');
    return this.getState(tenantId, principal);
  }

  /**
   * Passo 6 — horário de funcionamento. Grava `TenantBusinessHour` (a
   * barbearia) e propaga para `WorkSchedule` de cada barbeiro (a agenda), que é
   * o que a fase 04 consulta para montar os horários livres.
   */
  async saveBusinessHours(
    tenantId: string,
    dto: OnboardingBusinessHoursDto,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<OnboardingState> {
    const open = dto.hours.filter((hour) => !hour.closed);
    if (open.length === 0) {
      throw ApiException.badRequest('Deixe ao menos um dia aberto.');
    }
    for (const hour of open) {
      if (hour.closesAt <= hour.opensAt) {
        throw ApiException.badRequest('O horário de fechamento precisa ser depois do de abertura.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const hour of dto.hours) {
        await tx.tenantBusinessHour.upsert({
          where: { tenantId_weekday: { tenantId, weekday: hour.weekday } },
          create: { tenantId, ...hour },
          update: { opensAt: hour.opensAt, closesAt: hour.closesAt, closed: hour.closed },
        });
      }

      const barbers = await tx.barber.findMany({
        where: { tenantId, deletedAt: null, active: true },
        select: { id: true },
      });

      for (const barber of barbers) {
        for (const hour of dto.hours) {
          await tx.workSchedule.upsert({
            where: { barberId_weekday: { barberId: barber.id, weekday: hour.weekday } },
            create: {
              tenantId,
              barberId: barber.id,
              weekday: hour.weekday,
              startTime: hour.opensAt,
              endTime: hour.closed ? hour.opensAt + 1 : hour.closesAt,
              isDayOff: hour.closed,
            },
            update: {
              startTime: hour.opensAt,
              // A constraint `work_schedule_bounds` exige fim > início mesmo em
              // folga; o dia fechado é marcado por `isDayOff`, não pela janela.
              endTime: hour.closed ? hour.opensAt + 1 : hour.closesAt,
              isDayOff: hour.closed,
            },
          });
        }
      }
    });

    await this.advance(tenantId, 6);
    await this.recordSettingsChange(tenantId, principal, request, 'business-hours');
    return this.getState(tenantId, principal);
  }

  /** Tela de conclusão — marca o wizard como concluído e devolve o link público. */
  async complete(
    tenantId: string,
    principal: AuthPrincipal,
    request: RequestContext,
  ): Promise<OnboardingState> {
    await this.upsertSettings(this.prisma, tenantId, {
      onboardingStep: ONBOARDING_STEPS,
      onboardingDoneAt: new Date(),
    });

    await this.audit.record(
      {
        action: AuditAction.ONBOARDING_COMPLETED,
        entity: 'TenantSettings',
        entityId: tenantId,
        tenantId,
        actorUserId: principal.id,
      },
      request,
    );

    return this.getState(tenantId, principal);
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private publicUrl(slug: string): string {
    return `${this.config.urls.publicBooking}/agendar/${slug}`;
  }

  /** `onboardingStep` só sobe: pular etapa não pode fazer o wizard regredir. */
  private async advance(tenantId: string, step: number): Promise<void> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { onboardingStep: true },
    });

    if ((settings?.onboardingStep ?? 0) < step) {
      await this.upsertSettings(this.prisma, tenantId, { onboardingStep: step });
    }
  }

  private async upsertSettings(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    data: Omit<Prisma.TenantSettingsUncheckedCreateInput, 'tenantId'>,
  ): Promise<void> {
    await tx.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }

  /**
   * Liga cada barbeiro ativo a cada serviço ativo. Idempotente: só cria os
   * pares que faltam, então rodar de novo no passo seguinte não duplica nada.
   */
  private async syncBarberServices(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const [barbers, services, links] = await Promise.all([
      tx.barber.findMany({ where: { tenantId, deletedAt: null, active: true }, select: { id: true } }),
      tx.service.findMany({ where: { tenantId, deletedAt: null, active: true }, select: { id: true } }),
      tx.barberService.findMany({ where: { tenantId }, select: { barberId: true, serviceId: true } }),
    ]);

    const existing = new Set(links.map((link) => `${link.barberId}:${link.serviceId}`));
    const missing = barbers.flatMap((barber) =>
      services
        .filter((service) => !existing.has(`${barber.id}:${service.id}`))
        .map((service) => ({ tenantId, barberId: barber.id, serviceId: service.id })),
    );

    if (missing.length > 0) {
      await tx.barberService.createMany({ data: missing, skipDuplicates: true });
    }
  }

  private recordSettingsChange(
    tenantId: string,
    principal: AuthPrincipal,
    request: RequestContext,
    step: string,
  ): Promise<void> {
    return this.audit.record(
      {
        action: AuditAction.TENANT_SETTINGS_UPDATED,
        entity: 'TenantSettings',
        entityId: tenantId,
        tenantId,
        actorUserId: principal.id,
        metadata: { step },
      },
      request,
    );
  }
}

/** `Avenida Paulista, 1000 — Sala 12 · Bela Vista, São Paulo/SP`. */
function formatAddressLine(dto: OnboardingLocationDto): string {
  const street = [dto.street, dto.number].filter(Boolean).join(', ');
  const head = dto.complement ? `${street} — ${dto.complement}` : street;
  const tail = [dto.neighborhood, `${dto.city}/${dto.state}`].filter(Boolean).join(', ');
  return [head, tail].filter(Boolean).join(' · ');
}

/**
 * `Service` tem `@@unique([tenantId, name])`. Barrar aqui devolve uma mensagem
 * útil em vez do 409 genérico do banco. (Barbeiro não entra: dois "Carlos" na
 * mesma equipe é situação legítima, e o schema permite.)
 */
function assertUniqueNames(names: string[], label: string): void {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) {
      throw ApiException.badRequest(`Há mais de um ${label} com o nome "${name.trim()}".`);
    }
    seen.add(key);
  }
}
