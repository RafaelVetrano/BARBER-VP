/**
 * Seed do BarberVP — `make seed` / `pnpm prisma db seed`.
 *
 * Popula dois tenants (SPEC.md → Seed):
 *   · `barbearia-central`  — demo completo, com os dados reais do bundle;
 *   · `barbearia-isolamento` — vazio de propósito, contraparte da suíte de
 *     isolamento de tenant.
 *
 * É idempotente: apaga o que semeou antes (por slug/telefone) e recria, então
 * pode rodar quantas vezes quiser sem duplicar nada.
 */

import { hash } from '@node-rs/argon2';
import { CURRENT_TERMS_VERSION } from '@barbervp/types';
import {
  AccountStatus,
  AppointmentOrigin,
  AppointmentStatus,
  CashMovementType,
  CashRegisterStatus,
  CommissionEntryStatus,
  CommissionRuleType,
  LoyaltyPointsKind,
  MembershipRole,
  OrderItemKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  RaffleStatus,
  SaasInvoiceStatus,
  SubscriptionStatus,
  TenantStatus,
  WhatsappEvent,
} from '@prisma/client';
import {
  ACCOUNTS_PAYABLE,
  ACCOUNTS_RECEIVABLE,
  BANK_ACCOUNTS,
  BARBERS,
  BUSINESS_HOURS,
  CLIENTS,
  CLIENT_PLANS,
  CLIENT_PLAN_BILLING_DAY,
  COMMISSION_RULES,
  DEMO_PLAN_CODE,
  DEMO_TENANT,
  EXCLUSIVE_SERVICES,
  ISOLATION_TENANT,
  LOYALTY_PROGRAM,
  MIN,
  PRODUCTS,
  RAFFLES,
  REVIEWS,
  SAAS_PLANS,
  SERVICES,
  SERVICE_COMBOS,
  USERS,
  WHATSAPP_TEMPLATES,
  type BarberKey,
  type ServiceKey,
} from './seed-data';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────── Helpers ────────

/**
 * O Brasil não tem mais horário de verão (abolido em 2019), então
 * `America/Sao_Paulo` é UTC-3 o ano inteiro e a conversão pode ser aritmética.
 * Se um dia voltar, trocar por uma lib de timezone.
 */
const TZ_OFFSET_MINUTES = -180;

/** Meia-noite local de hoje, em UTC. */
function localMidnight(dayOffset = 0): Date {
  const now = new Date();
  const local = new Date(now.getTime() + TZ_OFFSET_MINUTES * 60_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset) -
      TZ_OFFSET_MINUTES * 60_000,
  );
}

/** Instante UTC de `minutesLocal` (minutos desde a meia-noite) em `dayOffset`. */
function at(dayOffset: number, minutesLocal: number): Date {
  return new Date(localMidnight(dayOffset).getTime() + minutesLocal * 60_000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

/** Primeiro dia do mês corrente (competência de comissões/vales). */
function currentMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Código de reserva determinístico do seed (`AG-S0001`). O código de produção é
 * aleatório (`booking-code.ts`); aqui previsível é melhor, para o dev conseguir
 * abrir sempre a mesma reserva ao testar cancelamento.
 */
function bookingCode(index: number): string {
  return `AG-S${String(index + 1).padStart(4, '0')}`;
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

const argon = (plain: string) => hash(plain, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

// ────────────────────────────────────────────────────────── Limpeza ─────────

async function reset(): Promise<void> {
  // Tenants caem em cascata; `Client` é global e precisa de limpeza própria.
  await prisma.tenant.deleteMany({
    where: { slug: { in: [DEMO_TENANT.slug, ISOLATION_TENANT.slug] } },
  });
  await prisma.client.deleteMany({ where: { phone: { in: CLIENTS.map((c) => c.phone) } } });
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(USERS).map((u) => u.email) } },
  });
  await prisma.saasPlan.deleteMany({ where: { code: { in: SAAS_PLANS.map((p) => p.code) } } });
}

// ──────────────────────────────────────────────────── Planos do SaaS ────────

async function seedSaasPlans(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const plan of SAAS_PLANS) {
    const created = await prisma.saasPlan.create({
      data: {
        code: plan.code,
        name: plan.name,
        priceCents: plan.priceCents,
        tier: plan.tier,
        maxBarbers: plan.maxBarbers,
        isPopular: plan.isPopular,
        sortOrder: plan.sortOrder,
        features: plan.features as unknown as Prisma.InputJsonValue,
        marketing: plan.marketing as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    ids.set(plan.code, created.id);
  }

  return ids;
}

// ─────────────────────────────────────────────────── Tenant de demo ─────────

async function seedDemoTenant(planIds: Map<string, string>): Promise<void> {
  const planId = planIds.get(DEMO_PLAN_CODE)!;

  const tenant = await prisma.tenant.create({
    data: {
      slug: DEMO_TENANT.slug,
      name: DEMO_TENANT.name,
      timezone: DEMO_TENANT.timezone,
      email: DEMO_TENANT.email,
      phone: DEMO_TENANT.phone,
      status: TenantStatus.ACTIVE,
      planId,
      settings: {
        create: {
          bloquearFaltasQtd: 3,
          antecedenciaMinima: 60,
          cancelamentoHoras: 2,
          sobre:
            'Há 12 anos no centro da cidade, a Barbearia Central mistura técnica clássica e ' +
            'acabamento moderno. Cortes, barba e cuidado de verdade — sem pressa.',
          instagram: '@barbeariacentral',
          whatsapp: DEMO_TENANT.phone,
          address: 'Rua XV de Novembro, 480 — Centro, São Paulo/SP',
        },
      },
      businessHours: { create: BUSINESS_HOURS.map((hour) => ({ ...hour })) },
      subscriptions: {
        create: {
          planId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: currentMonthStart(),
          currentPeriodEnd: daysFromNow(30),
        },
      },
      loyaltyProgram: { create: { ...LOYALTY_PROGRAM } },
      whatsappConfigs: {
        create: WHATSAPP_TEMPLATES.map((template) => ({
          event: template.event as WhatsappEvent,
          enabled: template.enabled,
          template: template.template,
          offsetMinutes: template.offsetMinutes,
        })),
      },
      bankAccounts: {
        create: BANK_ACCOUNTS.map((account) => ({
          name: account.name,
          type: account.type,
          balanceCents: account.balanceCents,
          acceptedMethods: [...account.acceptedMethods] as PaymentMethod[],
        })),
      },
    },
    select: { id: true },
  });

  const tenantId = tenant.id;

  await seedSaasInvoices(tenantId, planId);
  const users = await seedUsers(tenantId);
  const commissionRuleIds = await seedCommissionRules(tenantId);
  const serviceIds = await seedServices(tenantId);
  const barberIds = await seedBarbers(tenantId, commissionRuleIds, users.barberUserId);
  await seedServiceCombos(tenantId, serviceIds);
  await seedBarberServices(tenantId, barberIds, serviceIds);
  await seedWorkSchedules(tenantId, barberIds);
  await seedProducts(tenantId);

  const clientIds = await seedClients(tenantId);
  const planItemIds = await seedClientPlans(tenantId, serviceIds);
  await seedClientSubscriptions(tenantId, clientIds, planItemIds, serviceIds);

  const appointments = await seedAppointments(tenantId, barberIds, serviceIds, clientIds);
  await seedOrders(tenantId, barberIds, serviceIds, clientIds, appointments);
  await seedLoyalty(tenantId, clientIds);
  await seedCashRegister(tenantId, users.ownerUserId);
  await seedFinance(tenantId);
  await seedVales(tenantId, barberIds);
  await seedReviews(tenantId, barberIds);
}

/** Histórico de faturas do plano SaaS (`faturas` de `Dashboard.dc.html` → Configurações → Plano). */
async function seedSaasInvoices(tenantId: string, planId: string): Promise<void> {
  const plan = await prisma.saasPlan.findUniqueOrThrow({ where: { id: planId }, select: { priceCents: true } });
  const subscription = await prisma.tenantSubscription.findFirstOrThrow({
    where: { tenantId },
    select: { id: true },
  });

  await prisma.saasInvoice.createMany({
    data: [1, 2, 3, 4].map((monthsAgo) => ({
      tenantId,
      subscriptionId: subscription.id,
      amountCents: plan.priceCents,
      status: SaasInvoiceStatus.PAID,
      issuedAt: daysFromNow(-30 * monthsAgo),
      paidAt: daysFromNow(-30 * monthsAgo),
    })),
  });
}

// ─────────────────────────────────────────────────────────── Usuários ───────

interface SeededUsers {
  ownerUserId: string;
  managerUserId: string;
  barberUserId: string;
}

async function seedUsers(tenantId: string): Promise<SeededUsers> {
  await prisma.user.create({
    data: {
      email: USERS.superAdmin.email,
      name: USERS.superAdmin.name,
      passwordHash: await argon(USERS.superAdmin.password),
      isSuperAdmin: true,
      emailVerifiedAt: new Date(),
    },
  });

  const owner = await prisma.user.create({
    data: {
      email: USERS.owner.email,
      name: USERS.owner.name,
      passwordHash: await argon(USERS.owner.password),
      emailVerifiedAt: new Date(),
      memberships: { create: { tenantId, role: MembershipRole.OWNER } },
    },
    select: { id: true },
  });

  const manager = await prisma.user.create({
    data: {
      email: USERS.manager.email,
      name: USERS.manager.name,
      passwordHash: await argon(USERS.manager.password),
      emailVerifiedAt: new Date(),
      memberships: { create: { tenantId, role: MembershipRole.MANAGER } },
    },
    select: { id: true },
  });

  const barber = await prisma.user.create({
    data: {
      email: USERS.barber.email,
      name: USERS.barber.name,
      passwordHash: await argon(USERS.barber.password),
      emailVerifiedAt: new Date(),
      memberships: { create: { tenantId, role: MembershipRole.BARBER } },
    },
    select: { id: true },
  });

  return { ownerUserId: owner.id, managerUserId: manager.id, barberUserId: barber.id };
}

// ──────────────────────────────────────────────────────────── Comissões ─────

async function seedCommissionRules(tenantId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const rule of COMMISSION_RULES) {
    const created = await prisma.commissionRule.create({
      data: {
        tenantId,
        name: rule.name,
        type: rule.type as CommissionRuleType,
        percentBps: rule.percentBps,
        tiers: {
          create: rule.tiers.map((tier) => ({
            tenantId,
            upToCents: tier.upToCents,
            percentBps: tier.percentBps,
            sortOrder: tier.sortOrder,
          })),
        },
      },
      select: { id: true },
    });
    ids.set(rule.name, created.id);
  }

  return ids;
}

// ───────────────────────────────────────────────── Serviços e barbeiros ─────

async function seedServices(tenantId: string): Promise<Map<ServiceKey, string>> {
  const ids = new Map<ServiceKey, string>();

  for (const [index, service] of SERVICES.entries()) {
    const created = await prisma.service.create({
      data: {
        tenantId,
        name: service.name,
        durationMin: service.durationMin,
        priceCents: service.priceCents,
        category: service.category,
        isCombo: 'isCombo' in service ? service.isCombo : false,
        sortOrder: index,
      },
      select: { id: true },
    });
    ids.set(service.key, created.id);
  }

  return ids;
}

/**
 * Composição dos combos. Sem estas linhas o combo "Corte + Barba" seria um
 * serviço solto no catálogo, e escolher Corte + Barba no wizard cobraria R$ 80.
 */
async function seedServiceCombos(
  tenantId: string,
  serviceIds: Map<ServiceKey, string>,
): Promise<void> {
  await prisma.serviceComboPart.createMany({
    data: SERVICE_COMBOS.flatMap((combo) =>
      combo.parts.map((part) => ({
        tenantId,
        comboServiceId: serviceIds.get(combo.combo)!,
        partServiceId: serviceIds.get(part)!,
      })),
    ),
  });
}

async function seedBarbers(
  tenantId: string,
  commissionRuleIds: Map<string, string>,
  barberUserId: string,
): Promise<Map<BarberKey, string>> {
  const ids = new Map<BarberKey, string>();
  const defaultRuleId = commissionRuleIds.get('Comissão padrão')!;
  const tieredRuleId = commissionRuleIds.get('Comissão por faixa de faturamento')!;

  for (const [index, barber] of BARBERS.entries()) {
    const created = await prisma.barber.create({
      data: {
        tenantId,
        name: barber.name,
        specialty: barber.specialty,
        ratingBps: barber.ratingBps,
        sortOrder: index,
        hiredAt: daysFromNow(-400 + index * 60),
        // Diego é o mais sênior da casa e trabalha por faixa de faturamento.
        commissionRuleId: barber.key === 'diego' ? tieredRuleId : defaultRuleId,
        userId: barber.key === USERS.barber.barberKey ? barberUserId : null,
        email: barber.key === USERS.barber.barberKey ? USERS.barber.email : null,
      },
      select: { id: true },
    });
    ids.set(barber.key, created.id);
  }

  return ids;
}

/** Todos atendem tudo, exceto Pigmentação — só o Diego Alves (SPEC). */
async function seedBarberServices(
  tenantId: string,
  barberIds: Map<BarberKey, string>,
  serviceIds: Map<ServiceKey, string>,
): Promise<void> {
  const rows: Prisma.BarberServiceCreateManyInput[] = [];

  for (const service of SERVICES) {
    const allowed = EXCLUSIVE_SERVICES[service.key] ?? BARBERS.map((barber) => barber.key);
    for (const barberKey of allowed) {
      rows.push({
        tenantId,
        barberId: barberIds.get(barberKey)!,
        serviceId: serviceIds.get(service.key)!,
      });
    }
  }

  await prisma.barberService.createMany({ data: rows });
}

/** Seg–Sáb conforme o funcionamento da casa, almoço 12:00–13:00, domingo de folga. */
async function seedWorkSchedules(
  tenantId: string,
  barberIds: Map<BarberKey, string>,
): Promise<void> {
  const rows: Prisma.WorkScheduleCreateManyInput[] = [];

  for (const barberId of barberIds.values()) {
    for (const hours of BUSINESS_HOURS) {
      rows.push({
        tenantId,
        barberId,
        weekday: hours.weekday,
        startTime: hours.closed ? MIN['09:00'] : hours.opensAt,
        endTime: hours.closed ? MIN['18:00'] : hours.closesAt,
        lunchStart: hours.closed ? null : MIN['12:00'],
        lunchEnd: hours.closed ? null : MIN['13:00'],
        isDayOff: hours.closed,
      });
    }
  }

  await prisma.workSchedule.createMany({ data: rows });

  // Férias do Bruno Costa na semana que vem — exercita `ScheduleException`.
  await prisma.scheduleException.create({
    data: {
      tenantId,
      barberId: barberIds.get('bruno')!,
      startDate: localMidnight(7),
      endDate: localMidnight(14),
      type: 'VACATION',
      reason: 'Férias programadas',
    },
  });
}

async function seedProducts(tenantId: string): Promise<void> {
  await prisma.product.createMany({
    data: PRODUCTS.map((product) => ({ tenantId, ...product, category: 'Cuidados' })),
  });
}

// ──────────────────────────────────────────────────────────── Clientes ──────

async function seedClients(tenantId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const [index, client] of CLIENTS.entries()) {
    const password = 'password' in client ? client.password : undefined;

    const created = await prisma.client.create({
      data: {
        phone: client.phone,
        name: client.name,
        email: client.email,
        passwordHash: password ? await argon(password) : undefined,
        phoneVerifiedAt: new Date(),
        consentAt: new Date(),
        consentVersion: CURRENT_TERMS_VERSION,
        marketingOptIn: index % 3 !== 0,
        // WhatsApp ligado por padrão (como o protótipo já mostra em
        // `MinhaConta`); e-mail é opt-in — só o André, que tem senha e serve de
        // conta de demonstração completa, também liga o e-mail.
        notifyWhatsapp: true,
        notifyEmail: Boolean(password),
        profiles: {
          create: {
            tenantId,
            phone: client.phone,
            firstVisitAt: daysFromNow(-120 + index * 7),
            lastVisitAt: daysFromNow(-index * 3),
            visitCount: 12 - index,
            totalSpentCents: (12 - index) * 5_200,
            // O Igor Sampaio já acumulou faltas — serve de caso de teste para
            // o bloqueio por `bloquearFaltasQtd`.
            noShowCount: client.name === 'Igor Sampaio' ? 3 : 0,
            blocked: client.name === 'Igor Sampaio',
          },
        },
      },
      select: { id: true },
    });
    ids.set(client.phone, created.id);
  }

  return ids;
}

// ────────────────────────────────────── Assinaturas vendidas pela casa ──────

async function seedClientPlans(
  tenantId: string,
  serviceIds: Map<ServiceKey, string>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const plan of CLIENT_PLANS) {
    const created = await prisma.clientPlan.create({
      data: {
        tenantId,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        billingDay: CLIENT_PLAN_BILLING_DAY,
        isPopular: plan.isPopular,
        sortOrder: plan.sortOrder,
        items: {
          create: plan.items.map((item) => ({
            tenantId,
            serviceId: serviceIds.get(item.service)!,
            quota: item.quota,
          })),
        },
      },
      select: { id: true },
    });
    ids.set(plan.name, created.id);
  }

  return ids;
}

async function seedClientSubscriptions(
  tenantId: string,
  clientIds: Map<string, string>,
  planIds: Map<string, string>,
  serviceIds: Map<ServiceKey, string>,
): Promise<void> {
  const periodStart = currentMonthStart();
  const periodEnd = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
  );
  const nextChargeAt = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, CLIENT_PLAN_BILLING_DAY),
  );

  const assignments = [
    { phone: CLIENTS[0].phone, plan: 'Corte + Barba Quinzenal', used: { corte: 1, barba: 0 } },
    { phone: CLIENTS[3].phone, plan: 'Corte Semanal', used: { corte: 2 } },
    { phone: CLIENTS[6].phone, plan: 'Clube Completo', used: { corte: 1, barba: 1 } },
  ] as const;

  for (const assignment of assignments) {
    const planDefinition = CLIENT_PLANS.find((plan) => plan.name === assignment.plan)!;

    await prisma.clientSubscription.create({
      data: {
        tenantId,
        clientId: clientIds.get(assignment.phone)!,
        planId: planIds.get(assignment.plan)!,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextChargeAt,
        usages: {
          create: planDefinition.items.map((item) => ({
            tenantId,
            serviceId: serviceIds.get(item.service)!,
            periodStart,
            periodEnd,
            quota: item.quota,
            used: (assignment.used as Record<string, number | undefined>)[item.service] ?? 0,
          })),
        },
      },
    });
  }
}

// ─────────────────────────────────────────────────────── Agendamentos ───────

interface SeededAppointment {
  id: string;
  barberKey: BarberKey;
  serviceKey: ServiceKey;
  clientPhone: string;
  status: AppointmentStatus;
  startsAt: Date;
  priceCents: number;
}

/**
 * Agenda coerente: nenhum barbeiro tem dois atendimentos ativos sobrepostos —
 * a EXCLUDE constraint `no_double_booking` recusaria o insert.
 */
const AGENDA: Array<{
  dayOffset: number;
  barber: BarberKey;
  service: ServiceKey;
  clientIndex: number;
  startMinutes: number;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
}> = [
  // Hoje — Carlos Silva
  { dayOffset: 0, barber: 'carlos', service: 'corte', clientIndex: 0, startMinutes: 9 * 60, status: AppointmentStatus.DONE, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 0, barber: 'carlos', service: 'corte-barba', clientIndex: 1, startMinutes: 10 * 60, status: AppointmentStatus.DONE, origin: AppointmentOrigin.DASHBOARD },
  { dayOffset: 0, barber: 'carlos', service: 'corte', clientIndex: 2, startMinutes: 14 * 60, status: AppointmentStatus.CONFIRMED, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 0, barber: 'carlos', service: 'barba', clientIndex: 3, startMinutes: 15 * 60 + 30, status: AppointmentStatus.SCHEDULED, origin: AppointmentOrigin.PUBLIC },

  // Hoje — Rafael Souza
  { dayOffset: 0, barber: 'rafael', service: 'barba', clientIndex: 4, startMinutes: 9 * 60 + 30, status: AppointmentStatus.DONE, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 0, barber: 'rafael', service: 'corte', clientIndex: 8, startMinutes: 11 * 60, status: AppointmentStatus.NO_SHOW, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 0, barber: 'rafael', service: 'corte-barba', clientIndex: 5, startMinutes: 13 * 60 + 30, status: AppointmentStatus.CONFIRMED, origin: AppointmentOrigin.DASHBOARD },
  { dayOffset: 0, barber: 'rafael', service: 'corte', clientIndex: 6, startMinutes: 16 * 60, status: AppointmentStatus.SCHEDULED, origin: AppointmentOrigin.PUBLIC },

  // Hoje — Diego Alves (único que atende Pigmentação)
  { dayOffset: 0, barber: 'diego', service: 'pigmentacao', clientIndex: 7, startMinutes: 9 * 60, status: AppointmentStatus.DONE, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 0, barber: 'diego', service: 'corte', clientIndex: 9, startMinutes: 10 * 60 + 30, status: AppointmentStatus.CONFIRMED, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 0, barber: 'diego', service: 'pigmentacao', clientIndex: 1, startMinutes: 14 * 60, status: AppointmentStatus.SCHEDULED, origin: AppointmentOrigin.DASHBOARD },
  { dayOffset: 0, barber: 'diego', service: 'corte', clientIndex: 4, startMinutes: 16 * 60, status: AppointmentStatus.SCHEDULED, origin: AppointmentOrigin.PUBLIC },

  // Hoje — Bruno Costa (o das 10:00 foi cancelado; o horário fica livre)
  { dayOffset: 0, barber: 'bruno', service: 'corte-infantil', clientIndex: 2, startMinutes: 9 * 60, status: AppointmentStatus.DONE, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 0, barber: 'bruno', service: 'relaxamento', clientIndex: 3, startMinutes: 10 * 60, status: AppointmentStatus.CANCELED, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 0, barber: 'bruno', service: 'corte', clientIndex: 5, startMinutes: 13 * 60, status: AppointmentStatus.CONFIRMED, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 0, barber: 'bruno', service: 'sobrancelha', clientIndex: 6, startMinutes: 15 * 60, status: AppointmentStatus.SCHEDULED, origin: AppointmentOrigin.DASHBOARD },

  // Amanhã
  { dayOffset: 1, barber: 'carlos', service: 'corte-barba', clientIndex: 7, startMinutes: 9 * 60, status: AppointmentStatus.SCHEDULED, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 1, barber: 'rafael', service: 'barba', clientIndex: 9, startMinutes: 10 * 60, status: AppointmentStatus.SCHEDULED, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: 1, barber: 'diego', service: 'corte', clientIndex: 0, startMinutes: 11 * 60, status: AppointmentStatus.SCHEDULED, origin: AppointmentOrigin.PUBLIC },

  // Semana passada — histórico para relatórios
  { dayOffset: -7, barber: 'carlos', service: 'corte', clientIndex: 3, startMinutes: 14 * 60, status: AppointmentStatus.DONE, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: -7, barber: 'rafael', service: 'corte-barba', clientIndex: 4, startMinutes: 15 * 60, status: AppointmentStatus.DONE, origin: AppointmentOrigin.DASHBOARD },
  { dayOffset: -6, barber: 'diego', service: 'relaxamento', clientIndex: 5, startMinutes: 10 * 60, status: AppointmentStatus.DONE, origin: AppointmentOrigin.PUBLIC },
  { dayOffset: -6, barber: 'bruno', service: 'corte', clientIndex: 6, startMinutes: 16 * 60, status: AppointmentStatus.DONE, origin: AppointmentOrigin.PUBLIC },
];

async function seedAppointments(
  tenantId: string,
  barberIds: Map<BarberKey, string>,
  serviceIds: Map<ServiceKey, string>,
  clientIds: Map<string, string>,
): Promise<SeededAppointment[]> {
  const created: SeededAppointment[] = [];

  for (const [index, entry] of AGENDA.entries()) {
    const service = SERVICES.find((item) => item.key === entry.service)!;
    const client = CLIENTS[entry.clientIndex]!;
    const startsAt = at(entry.dayOffset, entry.startMinutes);
    const endsAt = addMinutes(startsAt, service.durationMin);

    const serviceId = serviceIds.get(entry.service)!;

    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        bookingCode: bookingCode(index),
        barberId: barberIds.get(entry.barber)!,
        serviceId,
        clientId: clientIds.get(client.phone)!,
        startsAt,
        endsAt,
        status: entry.status,
        origin: entry.origin,
        priceCents: service.priceCents,
        confirmedAt:
          entry.status === AppointmentStatus.CONFIRMED || entry.status === AppointmentStatus.DONE
            ? addMinutes(startsAt, -120)
            : null,
        canceledAt: entry.status === AppointmentStatus.CANCELED ? addMinutes(startsAt, -180) : null,
        cancelReason: entry.status === AppointmentStatus.CANCELED ? 'Imprevisto do cliente' : null,
        // A lista de serviços é a fonte de verdade da duração e do preço; o
        // `serviceId` acima é o principal, para agenda e comanda.
        services: {
          create: {
            tenantId,
            serviceId,
            sortOrder: 0,
            priceCents: service.priceCents,
            durationMin: service.durationMin,
          },
        },
      },
      select: { id: true },
    });

    created.push({
      id: appointment.id,
      barberKey: entry.barber,
      serviceKey: entry.service,
      clientPhone: client.phone,
      status: entry.status,
      startsAt,
      priceCents: service.priceCents,
    });
  }

  return created;
}

// ────────────────────────────────────────────────────────── Comandas ────────

async function seedOrders(
  tenantId: string,
  barberIds: Map<BarberKey, string>,
  serviceIds: Map<ServiceKey, string>,
  clientIds: Map<string, string>,
  appointments: SeededAppointment[],
): Promise<void> {
  const products = await prisma.product.findMany({
    where: { tenantId },
    select: { id: true, name: true, priceCents: true },
    orderBy: { name: 'asc' },
  });

  let orderNumber = 1;

  // Comandas FECHADAS — uma por atendimento concluído.
  for (const appointment of appointments.filter((a) => a.status === AppointmentStatus.DONE)) {
    const barberId = barberIds.get(appointment.barberKey)!;
    const serviceTotal = appointment.priceCents;

    // Um a cada três atendimentos leva um produto junto.
    const product = orderNumber % 3 === 0 ? products[orderNumber % products.length] : undefined;
    const subtotal = serviceTotal + (product?.priceCents ?? 0);
    const closedAt = addMinutes(appointment.startsAt, 75);

    const order = await prisma.order.create({
      data: {
        tenantId,
        number: orderNumber++,
        clientId: clientIds.get(appointment.clientPhone)!,
        barberId,
        appointmentId: appointment.id,
        status: OrderStatus.CLOSED,
        subtotalCents: subtotal,
        totalCents: subtotal,
        openedAt: appointment.startsAt,
        closedAt,
        items: {
          create: [
            {
              tenantId,
              kind: OrderItemKind.SERVICE,
              serviceId: serviceIds.get(appointment.serviceKey)!,
              barberId,
              description: SERVICES.find((s) => s.key === appointment.serviceKey)!.name,
              quantity: 1,
              unitPriceCents: serviceTotal,
              totalCents: serviceTotal,
            },
            ...(product
              ? [
                  {
                    tenantId,
                    kind: OrderItemKind.PRODUCT,
                    productId: product.id,
                    barberId,
                    description: product.name,
                    quantity: 1,
                    unitPriceCents: product.priceCents,
                    totalCents: product.priceCents,
                  },
                ]
              : []),
          ],
        },
        payments: {
          create: {
            tenantId,
            method:
              orderNumber % 2 === 0 ? PaymentMethod.PIX : PaymentMethod.CREDIT,
            status: PaymentStatus.PAID,
            amountCents: subtotal,
            paidAt: closedAt,
          },
        },
      },
      select: { id: true, items: { where: { kind: OrderItemKind.SERVICE }, select: { id: true } } },
    });

    // Comissão sobre o serviço (produto não gera comissão nesta regra).
    const percentBps = appointment.barberKey === 'diego' ? 4_000 : 4_000;
    const referenceMonth = new Date(Date.UTC(closedAt.getUTCFullYear(), closedAt.getUTCMonth(), 1));
    await prisma.commissionEntry.create({
      data: {
        tenantId,
        barberId,
        orderId: order.id,
        orderItemId: order.items[0]?.id ?? null,
        referenceMonth,
        baseCents: serviceTotal,
        percentBps,
        amountCents: Math.round((serviceTotal * percentBps) / 10_000),
        status: CommissionEntryStatus.PENDING,
      },
    });
  }

  // Comandas ABERTAS — atendimentos em andamento no balcão.
  const openOrders = [
    { barber: 'carlos' as BarberKey, service: 'corte' as ServiceKey, clientIndex: 8 },
    { barber: 'diego' as BarberKey, service: 'corte-barba' as ServiceKey, clientIndex: 9 },
  ];

  for (const open of openOrders) {
    const service = SERVICES.find((item) => item.key === open.service)!;
    await prisma.order.create({
      data: {
        tenantId,
        number: orderNumber++,
        clientId: clientIds.get(CLIENTS[open.clientIndex]!.phone)!,
        barberId: barberIds.get(open.barber)!,
        status: OrderStatus.OPEN,
        subtotalCents: service.priceCents,
        totalCents: service.priceCents,
        items: {
          create: {
            tenantId,
            kind: OrderItemKind.SERVICE,
            serviceId: serviceIds.get(open.service)!,
            barberId: barberIds.get(open.barber)!,
            description: service.name,
            quantity: 1,
            unitPriceCents: service.priceCents,
            totalCents: service.priceCents,
          },
        },
      },
    });
  }
}

// ─────────────────────────────────────────────────────────── Fidelidade ─────

async function seedLoyalty(tenantId: string, clientIds: Map<string, string>): Promise<void> {
  // Ledger de pontos — saldo é a soma das linhas.
  const ledger = [
    { phone: CLIENTS[0].phone, points: 145, kind: LoyaltyPointsKind.EARN, reason: 'Atendimentos de outubro' },
    { phone: CLIENTS[0].phone, points: -100, kind: LoyaltyPointsKind.REDEEM, reason: 'Desconto resgatado' },
    { phone: CLIENTS[1].phone, points: 70, kind: LoyaltyPointsKind.EARN, reason: 'Atendimentos de outubro' },
    { phone: CLIENTS[3].phone, points: 210, kind: LoyaltyPointsKind.EARN, reason: 'Assinatura + produtos' },
    { phone: CLIENTS[6].phone, points: 55, kind: LoyaltyPointsKind.EARN, reason: 'Atendimentos de outubro' },
  ];

  await prisma.loyaltyPoints.createMany({
    data: ledger.map((entry) => ({
      tenantId,
      clientId: clientIds.get(entry.phone)!,
      points: entry.points,
      kind: entry.kind,
      reason: entry.reason,
      expiresAt: daysFromNow(365),
    })),
  });

  for (const raffle of RAFFLES) {
    const isFinished = raffle.status === 'FINISHED';
    await prisma.loyaltyRaffle.create({
      data: {
        tenantId,
        name: raffle.name,
        description: raffle.description,
        prize: raffle.prize,
        status: raffle.status as RaffleStatus,
        pointsPerEntry: raffle.pointsPerEntry,
        startsAt: daysFromNow(raffle.startsInDays),
        endsAt: daysFromNow(raffle.endsInDays),
        winnerClientId: isFinished ? clientIds.get(CLIENTS[3].phone)! : null,
        drawnAt: isFinished ? daysFromNow(raffle.endsInDays) : null,
        entries: {
          create: [
            { tenantId, clientId: clientIds.get(CLIENTS[0].phone)!, entries: 14 },
            { tenantId, clientId: clientIds.get(CLIENTS[3].phone)!, entries: 21 },
            { tenantId, clientId: clientIds.get(CLIENTS[6].phone)!, entries: 5 },
          ],
        },
      },
    });
  }
}

// ────────────────────────────────────────────────────────────── Caixa ───────

async function seedCashRegister(tenantId: string, openedByUserId: string): Promise<void> {
  const openingCents = 20_000;

  const register = await prisma.cashRegister.create({
    data: {
      tenantId,
      openedByUserId,
      status: CashRegisterStatus.OPEN,
      openingCents,
      openedAt: at(0, MIN['09:00']),
      movements: {
        create: [
          {
            tenantId,
            type: CashMovementType.OPENING,
            amountCents: openingCents,
            description: 'Abertura do caixa',
            createdByUserId: openedByUserId,
          },
          {
            tenantId,
            type: CashMovementType.WITHDRAWAL,
            amountCents: -5_000,
            description: 'Compra de café e insumos',
            createdByUserId: openedByUserId,
          },
        ],
      },
    },
    select: { id: true },
  });

  // Vendas pagas em dinheiro entram no caixa.
  const cashPayments = await prisma.payment.findMany({
    where: { tenantId, method: PaymentMethod.CASH, status: PaymentStatus.PAID },
    select: { id: true, orderId: true, amountCents: true },
  });

  if (cashPayments.length > 0) {
    await prisma.cashMovement.createMany({
      data: cashPayments.map((payment) => ({
        tenantId,
        cashRegisterId: register.id,
        type: CashMovementType.SALE,
        amountCents: payment.amountCents,
        description: 'Venda em dinheiro',
        orderId: payment.orderId,
        paymentId: payment.id,
      })),
    });
  }
}

// ────────────────────────────────────────────────────────── Financeiro ─────

async function seedFinance(tenantId: string): Promise<void> {
  // As contas de cartão/Pix caem na Nubank PJ — a mesma que o modal "Conta de
  // entrada/saída" do bundle usa como padrão (`contaSaida`/`contaEntrada`).
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { tenantId, name: 'Nubank PJ' },
    select: { id: true },
  });

  await prisma.accountPayable.createMany({
    data: ACCOUNTS_PAYABLE.map((account) => ({
      tenantId,
      description: account.description,
      category: account.category,
      supplier: account.supplier,
      amountCents: account.amountCents,
      dueDate: daysFromNow(account.dueInDays),
      installment: account.installment,
      installments: account.installments,
      status: account.status === 'PAID' ? AccountStatus.PAID : AccountStatus.PENDING,
      paidAt: account.status === 'PAID' ? daysFromNow(account.dueInDays) : null,
      bankAccountId: bankAccount?.id ?? null,
    })),
  });

  await prisma.accountReceivable.createMany({
    data: ACCOUNTS_RECEIVABLE.map((account) => ({
      tenantId,
      description: account.description,
      category: account.category,
      customer: account.customer,
      amountCents: account.amountCents,
      dueDate: daysFromNow(account.dueInDays),
      installment: account.installment,
      installments: account.installments,
      status: account.status === 'RECEIVED' ? AccountStatus.RECEIVED : AccountStatus.PENDING,
      receivedAt: account.status === 'RECEIVED' ? daysFromNow(account.dueInDays) : null,
      bankAccountId: bankAccount?.id ?? null,
    })),
  });
}

async function seedVales(tenantId: string, barberIds: Map<BarberKey, string>): Promise<void> {
  await prisma.vale.createMany({
    data: [
      {
        tenantId,
        barberId: barberIds.get('rafael')!,
        amountCents: 30_000,
        referenceMonth: currentMonthStart(),
        description: 'Adiantamento quinzenal',
      },
      {
        tenantId,
        barberId: barberIds.get('bruno')!,
        amountCents: 15_000,
        referenceMonth: currentMonthStart(),
        description: 'Adiantamento para material',
      },
    ],
  });
}

// ────────────────────────────────────────────────────────── Avaliações ─────

/**
 * Avaliações da página pública. `daysAgo` vira `createdAt` de verdade — o
 * "há 3 dias" da tela é derivado disso no navegador de quem lê, e não um texto
 * congelado que envelhece sozinho.
 */
async function seedReviews(
  tenantId: string,
  barberIds: Map<BarberKey, string>,
): Promise<void> {
  await prisma.review.createMany({
    data: REVIEWS.map((review) => ({
      tenantId,
      barberId: review.barberKey ? barberIds.get(review.barberKey)! : null,
      authorName: review.authorName,
      rating: review.rating,
      comment: review.comment,
      createdAt: daysFromNow(-review.daysAgo),
    })),
  });
}

// ──────────────────────────────────────────── Tenant vazio (isolamento) ─────

async function seedIsolationTenant(planIds: Map<string, string>): Promise<void> {
  await prisma.tenant.create({
    data: {
      slug: ISOLATION_TENANT.slug,
      name: ISOLATION_TENANT.name,
      timezone: ISOLATION_TENANT.timezone,
      status: TenantStatus.TRIAL,
      planId: planIds.get('essencial')!,
      settings: { create: {} },
      businessHours: { create: BUSINESS_HOURS.map((hour) => ({ ...hour })) },
    },
  });
}

// ─────────────────────────────────────────────────────────────── Main ───────

async function main(): Promise<void> {
  console.info('› limpando dados semeados anteriormente…');
  await reset();

  console.info('› planos do SaaS…');
  const planIds = await seedSaasPlans();

  console.info(`› tenant demo (${DEMO_TENANT.slug})…`);
  await seedDemoTenant(planIds);

  console.info(`› tenant de isolamento (${ISOLATION_TENANT.slug})…`);
  await seedIsolationTenant(planIds);

  const [barbers, services, appointments, orders, clients] = await Promise.all([
    prisma.barber.count(),
    prisma.service.count(),
    prisma.appointment.count(),
    prisma.order.count(),
    prisma.client.count(),
  ]);

  console.info('\n✓ seed concluído');
  console.info(`  tenants: 2 · barbeiros: ${barbers} · serviços: ${services}`);
  console.info(`  clientes: ${clients} · agendamentos: ${appointments} · comandas: ${orders}`);
  console.info(`  funcionamento: Seg–Sex ${hhmm(MIN['09:00'])}–${hhmm(MIN['20:00'])} · Sáb ${hhmm(MIN['09:00'])}–${hhmm(MIN['18:00'])} · Dom fechado`);
  console.info(`\n  login owner:  ${USERS.owner.email} / ${USERS.owner.password}`);
  console.info(`  login admin:  ${USERS.superAdmin.email} / ${USERS.superAdmin.password}`);
  console.info(`  login cliente: ${CLIENTS[0].phone} (ou ${CLIENTS[0].email}) / ${CLIENTS[0].password} — já é assinante do Corte + Barba Quinzenal`);
  console.info('  (senhas de desenvolvimento — nunca use estas em produção)\n');
}

main()
  .catch((error) => {
    console.error('✗ seed falhou:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
