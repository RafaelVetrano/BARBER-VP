/**
 * Seed de DEMONSTRAÇÃO — `make seed-demo`. **Nunca roda em produção.**
 *
 * Roda o seed base (`seed.ts`) e engorda o tenant demo até o volume que a
 * auditoria de tela precisa: 5 barbeiros, 40 clientes, um mês de agenda em
 * todos os status, ~600 comandas fechadas com comissão/pagamento/estoque
 * batendo, caixa de ontem fechado, contas vencendo na semana, assinantes com
 * uso parcial, outbox, auditoria e histórico do Assistente IA. O tenant
 * secundário ganha o mínimo em CADA módulo — é ele que prova isolamento a olho.
 *
 * Três invariantes governam este arquivo:
 *
 * 1. **Datas relativas.** Nada de data absoluta: tudo é deslocamento a partir
 *    de `new Date()`, então o dashboard fica vivo em qualquer dia de execução.
 * 2. **Idempotência.** O seed base derruba os dois tenants e os clientes da
 *    faixa de telefone reservada antes de recriar; o que este arquivo cria fora
 *    dessa cascata (usuário do tenant secundário, `AuditLog` órfão) ele mesmo
 *    apaga em `resetDemoExtras()`.
 * 3. **Coerência.** Os números são DERIVADOS uns dos outros, na mesma ordem que
 *    a aplicação usa: comanda fechada → item → comissão (com a mesma regra de
 *    faixa do `CommissionCalcService`) → pagamento → caixa → agregado do
 *    perfil do cliente. Auditar tela com número que não fecha esconde bug.
 */

import { createHmac } from 'node:crypto';
import {
  AccountStatus,
  AppointmentOrigin,
  AppointmentStatus,
  AiMessageRole,
  CashMovementType,
  CashRegisterStatus,
  CommissionEntryStatus,
  CommissionEntryKind,
  CommissionRuleType,
  DiscountType,
  MembershipRole,
  NotificationChannel,
  OrderItemKind,
  OrderStatus,
  OutboxStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ScheduleExceptionType,
  StaffInviteStatus,
  SubscriptionStatus,
  TenantStatus,
  WhatsappEvent,
} from '@prisma/client';
import { CURRENT_TERMS_VERSION } from '@barbervp/types';
import {
  TZ_OFFSET_MINUTES,
  addMinutes,
  argon,
  at,
  currentMonthStart,
  daysFromNow,
  localMidnight,
  main as seedBase,
  prisma,
} from './seed';
import {
  BARBERS,
  BUSINESS_HOURS,
  CLIENTS,
  CLIENT_PLAN_BILLING_DAY,
  DEMO_TENANT,
  ISOLATION_TENANT,
  SERVICES,
  USERS,
  WHATSAPP_REMINDER_ENABLED_MONTHS_AGO,
  WHATSAPP_TEMPLATES,
  type ServiceKey,
} from './seed-data';
import {
  DEMO_AI_CONVERSATION,
  DEMO_BARBER_WEIGHTS,
  DEMO_CLIENTS,
  DEMO_EXTRA_BARBER,
  DEMO_EXTRA_PAYABLES,
  DEMO_EXTRA_PRODUCTS,
  DEMO_PRICE_CALC_FIXED_COSTS,
  DEMO_PRICE_CALC_VARIAVEL_CENTS,
  DEMO_SCHEDULES,
  DEMO_STAFF_INVITE,
  SECONDARY_TENANT,
  type DemoBarberKey,
  type DemoSegment,
} from './seed-demo-data';

// ─────────────────────────────────────────────────────────── Parâmetros ─────

/**
 * Janela com dado OPERACIONAL denso (agenda cheia, comanda, comissão).
 *
 * São 60 dias, e não 30, por causa da competência: com 30 o MÊS ANTERIOR ficava
 * pela metade, e nenhum barbeiro chegava a cruzar a primeira faixa da comissão
 * por faturamento (SPEC: 40% até R$5.000, 45% até R$8.000, 50% acima) — a aba
 * Comissões nunca exibiria uma faixa que não a primeira, e não haveria um mês
 * fechado inteiro para auditar contra os relatórios.
 */
const DETAILED_DAYS = 60;
/**
 * Janela com histórico ESPARSO. Existe por causa das sparklines da home, que
 * são de 8 meses (`SPARKLINE_POINTS`): sem faturamento e sem falta nos meses
 * anteriores, os quatro mini-gráficos dos KPIs nasceriam achatados no zero.
 */
const HISTORY_DAYS = 240;
const FUTURE_DAYS = 7;

/**
 * Atendimentos por barbeiro por dia na janela densa (contando o que o seed base
 * já plantou). O número é depois PONDERADO por `DEMO_BARBER_WEIGHTS`: sem isso
 * todo mundo fecha o dia com a mesma agenda e o ranking da home vira empate
 * quíntuplo — um bloco que existe justamente para mostrar diferença.
 */
const APPOINTMENTS_PER_BARBER_MIN = 4;
const APPOINTMENTS_PER_BARBER_MAX = 6;
/** Peso "neutro" da tabela de pesos: acima dele o barbeiro atende mais. */
const NEUTRAL_WEIGHT = 20;
/** Atendimentos por dia na janela esparsa — o suficiente para a série mensal. */
const HISTORY_APPOINTMENTS_PER_DAY = 1.4;

const GRID_MINUTES = 15;
const LOW_STOCK_PRODUCTS = ['Pomada Argila Modeladora', 'Talco Pós-Barba'];

// ────────────────────────────────────────────────────────────── Helpers ─────

/**
 * PRNG determinístico (mulberry32). O demo tem de ser reproduzível: rodar duas
 * vezes no mesmo dia produz exatamente o mesmo banco, então "sumiu um dado"
 * nunca é dúvida entre bug e sorteio.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const rnd = makeRandom(20_260_814);

function randomInt(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)] as T;
}

function pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let cursor = rnd() * total;
  for (const item of items) {
    cursor -= weightOf(item);
    if (cursor <= 0) return item;
  }
  return items[items.length - 1] as T;
}

/**
 * Id estável e legível (`odm-000123`). Poderia ser `cuid()`, mas id previsível
 * deixa o dev abrir sempre a mesma comanda entre duas execuções do seed.
 */
function makeIds(prefix: string): () => string {
  let counter = 0;
  return () => `${prefix}${String((counter += 1)).padStart(9, '0')}`;
}

/** Dia da semana LOCAL (0 = domingo) do dia `dayOffset`. */
function localWeekday(dayOffset: number): number {
  return new Date(localMidnight(dayOffset).getTime() + TZ_OFFSET_MINUTES * 60_000).getUTCDay();
}

/** Minutos desde a meia-noite local, agora. */
function nowMinutesLocal(): number {
  const local = new Date(Date.now() + TZ_OFFSET_MINUTES * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** Primeiro dia (UTC) do mês de `date` — competência de comissão/vale. */
function monthStartOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** `Date` puro (sem hora) `dayOffset` dias à frente — colunas `@db.Date`. */
function dateOnly(dayOffset: number): Date {
  const local = new Date(Date.now() + TZ_OFFSET_MINUTES * 60_000 + dayOffset * 86_400_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** Aniversário: a data cai daqui a `inDays`, num ano de nascimento plausível. */
function birthDate(inDays: number, index: number): Date {
  const day = dateOnly(inDays);
  return new Date(Date.UTC(1978 + (index % 22), day.getUTCMonth(), day.getUTCDate()));
}

/**
 * Empurra o dia para fora do domingo, quando a casa fecha — para a frente se
 * for futuro, para trás se for passado. Usado pelas agendas de posição FIXA
 * (tenant secundário, caixa de ontem), que não passam pelo gerador e portanto
 * não têm o `weekday === 0 → continue` dele.
 */
function openDay(dayOffset: number): number {
  if (localWeekday(dayOffset) !== 0) return dayOffset;
  return dayOffset >= 0 ? dayOffset + 1 : dayOffset - 1;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ─────────────────────────────────────────────────────────────── Tipos ──────

interface BarberRow {
  id: string;
  key: DemoBarberKey;
  name: string;
  rule: { type: CommissionRuleType; percentBps: number | null; percentProdutosBps: number; tiers: Array<{ upToCents: number | null; percentBps: number; sortOrder: number }> } | null;
  schedule: { startTime: number; endTime: number; lunchStart: number; lunchEnd: number; dayOff: number };
  serviceKeys: ServiceKey[];
}

interface ServiceRow {
  id: string;
  key: ServiceKey;
  name: string;
  durationMin: number;
  priceCents: number;
}

interface ClientRow {
  id: string;
  profileId: string;
  name: string;
  phone: string;
  segment: DemoSegment;
  /**
   * Dia (relativo a hoje) em que este cliente apareceu pela PRIMEIRA vez. É o
   * que espalha `ClientProfile.firstVisitAt` pelos 8 meses e dá inclinação ao
   * KPI "Novos clientes" — sem ele, todo mundo estreava no mês mais antigo e a
   * sparkline caía a zero e ficava lá.
   */
  entryDay: number;
}

interface GeneratedAppointment {
  id: string;
  barber: BarberRow;
  service: ServiceRow;
  client: ClientRow;
  dayOffset: number;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
}

/** Slots ocupados por barbeiro e dia — a EXCLUDE `no_double_booking` é real. */
type Occupancy = Map<string, Array<[number, number]>>;

// ══════════════════════════════════════════════════════════════ Limpeza ═════

/**
 * O seed base já apagou os dois tenants (cascata) e os clientes da faixa
 * reservada. Sobram as linhas que vivem FORA dessa cascata.
 */
async function resetDemoExtras(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: SECONDARY_TENANT.ownerEmail } });
  // `AuditLog.tenantId` é `SetNull` na exclusão do tenant: sem esta limpeza, as
  // linhas do demo sobrevivem órfãs e se acumulam a cada execução.
  await prisma.auditLog.deleteMany({
    where: { metadata: { path: ['seed'], equals: 'demo' } },
  });
  // A conversa do Assistente é `createMany` puro: sem esta limpeza, cada
  // execução do seed empilha outras 24 mensagens no mesmo mês — e como a cota
  // do plano é contada por TENANT, o contador da aba subiria sozinho a cada
  // reseed até fechar a porta no tenant de demonstração.
  await prisma.aiChatMessage.deleteMany({
    where: { tenant: { slug: DEMO_TENANT.slug } },
  });
}

// ══════════════════════════════════════════════════════ Equipe e catálogo ═══

/**
 * Escalas diferentes por barbeiro, com uma trava: NENHUM barbeiro folga nos
 * dias em que o seed base já plantou atendimento (hoje, amanhã e a semana
 * passada). Agenda em dia de folga é exatamente o tipo de incoerência que faz
 * a auditoria caçar bug onde só havia seed torto.
 */
function assignDaysOff(): number[] {
  const busy = new Set([localWeekday(0), localWeekday(1), localWeekday(-6), localWeekday(-7), 0]);
  const candidates = [1, 2, 3, 4, 5, 6].filter((weekday) => !busy.has(weekday));
  const pool = candidates.length > 0 ? candidates : [1];
  return DEMO_SCHEDULES.map((schedule) => pool[schedule.dayOffIndex % pool.length] as number);
}

async function seedTeamAndCatalog(tenantId: string): Promise<{ barbers: BarberRow[]; services: ServiceRow[] }> {
  const services = (
    await prisma.service.findMany({
      where: { tenantId },
      select: { id: true, name: true, durationMin: true, priceCents: true },
    })
  ).map((service) => ({
    ...service,
    key: SERVICES.find((item) => item.name === service.name)!.key as ServiceKey,
  }));

  const defaultRule = await prisma.commissionRule.findFirstOrThrow({
    where: { tenantId, name: 'Comissão padrão' },
    select: { id: true },
  });

  // 5º barbeiro — só no demo (o SPEC fixa a equipe do booking em 4).
  await prisma.barber.create({
    data: {
      tenantId,
      name: DEMO_EXTRA_BARBER.name,
      specialty: DEMO_EXTRA_BARBER.specialty,
      ratingBps: DEMO_EXTRA_BARBER.ratingBps,
      phone: DEMO_EXTRA_BARBER.phone,
      email: DEMO_EXTRA_BARBER.email,
      commissionRuleId: defaultRule.id,
      sortOrder: BARBERS.length,
      hiredAt: daysFromNow(-150),
    },
  });

  const rows = await prisma.barber.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      commissionRule: {
        select: {
          type: true,
          percentBps: true,
          percentProdutosBps: true,
          tiers: { select: { upToCents: true, percentBps: true, sortOrder: true } },
        },
      },
    },
  });

  const keyOf = (name: string): DemoBarberKey =>
    name === DEMO_EXTRA_BARBER.name
      ? DEMO_EXTRA_BARBER.key
      : (BARBERS.find((barber) => barber.name === name)!.key as DemoBarberKey);

  const daysOff = assignDaysOff();

  const barbers: BarberRow[] = rows.map((row) => {
    const key = keyOf(row.name);
    const index = DEMO_SCHEDULES.findIndex((schedule) => schedule.barber === key);
    const schedule = DEMO_SCHEDULES[index]!;
    return {
      id: row.id,
      key,
      name: row.name,
      rule: row.commissionRule,
      schedule: {
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        lunchStart: schedule.lunchStart,
        lunchEnd: schedule.lunchEnd,
        dayOff: daysOff[index] as number,
      },
      // Pigmentação continua exclusiva do Diego (SPEC); o resto todos atendem.
      serviceKeys: services
        .filter((service) => service.key !== 'pigmentacao' || key === 'diego')
        .map((service) => service.key),
    };
  });

  // Maria atende o catálogo inteiro menos Pigmentação.
  const maria = barbers.find((barber) => barber.key === DEMO_EXTRA_BARBER.key)!;
  await prisma.barberService.createMany({
    data: maria.serviceKeys.map((key) => ({
      tenantId,
      barberId: maria.id,
      serviceId: services.find((service) => service.key === key)!.id,
    })),
  });

  // Escalas: reescreve as do seed base (todas idênticas) pelas diferenciadas.
  await prisma.workSchedule.deleteMany({ where: { tenantId } });
  await prisma.workSchedule.createMany({
    data: barbers.flatMap((barber) =>
      BUSINESS_HOURS.map((hour) => {
        const off = hour.closed || hour.weekday === barber.schedule.dayOff;
        return {
          tenantId,
          barberId: barber.id,
          weekday: hour.weekday,
          startTime: Math.max(barber.schedule.startTime, hour.opensAt || barber.schedule.startTime),
          endTime: Math.min(barber.schedule.endTime, hour.closesAt || barber.schedule.endTime),
          lunchStart: off ? null : barber.schedule.lunchStart,
          lunchEnd: off ? null : barber.schedule.lunchEnd,
          isDayOff: off,
        };
      }),
    ),
  });

  // Folga avulsa (o seed base já tem as férias do Bruno).
  await prisma.scheduleException.create({
    data: {
      tenantId,
      barberId: maria.id,
      startDate: dateOnly(4),
      endDate: dateOnly(4),
      type: ScheduleExceptionType.DAY_OFF,
      reason: 'Compromisso pessoal',
    },
  });

  await prisma.product.createMany({
    data: DEMO_EXTRA_PRODUCTS.map((product) => ({ tenantId, ...product })),
  });

  return { barbers, services };
}

/**
 * Convite de equipe pendente. O segredo é fixo no demo e o `tokenHash` sai do
 * mesmo HMAC do `InvitesService`, então o link impresso no fim do seed abre de
 * verdade a tela de aceite.
 */
async function seedStaffInvite(tenantId: string, ownerUserId: string, services: ServiceRow[]): Promise<string> {
  const pepper = process.env.JWT_REFRESH_SECRET ?? '';
  const invite = await prisma.staffInvite.create({
    data: {
      tenantId,
      email: DEMO_STAFF_INVITE.email,
      phone: DEMO_STAFF_INVITE.phone,
      name: DEMO_STAFF_INVITE.name,
      role: MembershipRole.BARBER,
      serviceIds: DEMO_STAFF_INVITE.services.map(
        (key) => services.find((service) => service.key === key)!.id,
      ),
      workDays: [...DEMO_STAFF_INVITE.workDays],
      tokenHash: createHmac('sha256', pepper).update(DEMO_STAFF_INVITE.secret).digest('hex'),
      status: StaffInviteStatus.PENDING,
      invitedByUserId: ownerUserId,
      expiresAt: daysFromNow(6),
      createdAt: daysFromNow(-1),
    },
    select: { id: true },
  });

  await prisma.mailOutbox.create({
    data: {
      tenantId,
      to: DEMO_STAFF_INVITE.email,
      subject: `Convite para a equipe da ${DEMO_TENANT.name}`,
      body: `Olá ${DEMO_STAFF_INVITE.name}, você foi convidado para a equipe. Aceite em /app/aceitar-convite?token=${invite.id}.${DEMO_STAFF_INVITE.secret}`,
      status: OutboxStatus.SENT,
      sentAt: daysFromNow(-1),
    },
  });

  return `${invite.id}.${DEMO_STAFF_INVITE.secret}`;
}

// ══════════════════════════════════════════════════════════════ Clientes ════

async function seedDemoClients(tenantId: string, barbers: BarberRow[]): Promise<ClientRow[]> {
  const profileId = makeIds('cpd');
  const clientId = makeIds('cld');

  // Os 10 do seed base ganham aniversário — sem `birthDate` o alerta de
  // aniversariantes da home nunca acende, nem com 40 clientes no banco.
  const baseClients = await prisma.client.findMany({
    where: { phone: { in: CLIENTS.map((client) => client.phone) } },
    select: { id: true, name: true, phone: true, profiles: { where: { tenantId }, select: { id: true } } },
  });

  for (const [index, client] of baseClients.entries()) {
    await prisma.client.update({
      where: { id: client.id },
      // 20+ dias à frente: fora da janela de 7 dias do alerta, que é povoada
      // de propósito por três dos clientes novos.
      data: { birthDate: birthDate(20 + index * 11, index) },
    });
  }

  const rows: Prisma.ClientCreateManyInput[] = [];
  const profiles: Prisma.ClientProfileCreateManyInput[] = [];
  const created: ClientRow[] = [];

  const inactiveTotal = DEMO_CLIENTS.filter((client) => client.segment === 'inativo').length;
  const regularTotal = DEMO_CLIENTS.length - inactiveTotal;
  let inactiveSeen = 0;
  let regularSeen = 0;

  for (const [index, client] of DEMO_CLIENTS.entries()) {
    const id = clientId();
    const profile = profileId();

    rows.push({
      id,
      phone: client.phone,
      name: client.name,
      email: client.email,
      birthDate: birthDate(client.birthdayInDays, index),
      phoneVerifiedAt: daysFromNow(-200 + index),
      consentAt: daysFromNow(-200 + index),
      consentVersion: CURRENT_TERMS_VERSION,
      marketingOptIn: index % 3 !== 0,
      notifyWhatsapp: true,
      notifyEmail: client.email !== null && index % 4 === 0,
    });

    profiles.push({
      id: profile,
      tenantId,
      clientId: id,
      phone: client.phone,
      notes: client.notes ?? null,
      favoriteBarberId: barbers[index % barbers.length]!.id,
      // Agregados nascem zerados e são RECALCULADOS a partir das comandas em
      // `syncClientProfiles()` — nenhum número aqui é chutado.
      visitCount: 0,
      totalSpentCents: 0,
    });

    // Quem entrou quando: inativos são clientela ANTIGA (por isso sumiram), o
    // `novo` estreia no mês corrente e o resto chega de forma constante ao
    // longo dos 8 meses — que é como uma barbearia de verdade cresce.
    const entryDay =
      client.segment === 'novo'
        ? -12
        : client.segment === 'inativo'
          ? Math.round(-235 + (inactiveSeen++ / Math.max(1, inactiveTotal - 1)) * 80)
          : Math.round(-215 + (regularSeen++ / Math.max(1, regularTotal - 1)) * 205);

    created.push({
      id,
      profileId: profile,
      name: client.name,
      phone: client.phone,
      segment: client.segment,
      entryDay,
    });
  }

  await prisma.client.createMany({ data: rows });
  await prisma.clientProfile.createMany({ data: profiles });

  const base: ClientRow[] = baseClients.map((client, index) => ({
    id: client.id,
    profileId: client.profiles[0]!.id,
    name: client.name,
    phone: client.phone,
    // O Igor Sampaio já vem com 3 faltas e bloqueado do seed base.
    segment: client.name === 'Igor Sampaio' ? 'faltoso' : 'ativo',
    // Os 10 do seed base são a clientela mais antiga da casa.
    entryDay: -238 + index * 4,
  }));

  return [...base, ...created];
}

// ══════════════════════════════════════════════════════════════ Agenda ══════

/** Carrega o que o seed base já plantou, para o gerador não sobrepor nada. */
async function loadOccupancy(tenantId: string, barbers: BarberRow[]): Promise<Occupancy> {
  const rows = await prisma.appointment.findMany({
    where: { tenantId },
    select: { barberId: true, startsAt: true, endsAt: true },
  });

  const occupancy: Occupancy = new Map();
  const today = localMidnight(0).getTime();
  const barberIds = new Set(barbers.map((barber) => barber.id));

  for (const row of rows) {
    if (!barberIds.has(row.barberId)) continue;
    const dayOffset = Math.floor((row.startsAt.getTime() - today) / 86_400_000);
    const dayStart = localMidnight(dayOffset).getTime();
    occupy(
      occupancy,
      row.barberId,
      dayOffset,
      Math.round((row.startsAt.getTime() - dayStart) / 60_000),
      Math.round((row.endsAt.getTime() - dayStart) / 60_000),
    );
  }

  return occupancy;
}

function isFree(occupancy: Occupancy, barberId: string, dayOffset: number, start: number, end: number): boolean {
  const slots = occupancy.get(`${barberId}|${dayOffset}`) ?? [];
  return !slots.some(([slotStart, slotEnd]) => overlaps(start, end, slotStart, slotEnd));
}

function occupy(occupancy: Occupancy, barberId: string, dayOffset: number, start: number, end: number): void {
  const key = `${barberId}|${dayOffset}`;
  occupancy.set(key, [...(occupancy.get(key) ?? []), [start, end]]);
}

/**
 * Fila de clientes das faltas — é ela que CONTROLA a distribuição de faltas,
 * em vez de sortear cliente a cada NO_SHOW (sorteio livre dava duas faltas
 * para meio cadastro, e o ⚠ da agenda deixava de significar alguma coisa).
 *
 * A fila é consumida em ordem e não repete: cada cliente comum leva no máximo
 * uma falta; os dois "faltosos" da auditoria levam duas (o ⚠ sem bloqueio); o
 * Igor Sampaio leva três, que é o que o seed base afirma sobre ele e o que
 * justifica o bloqueio por `bloquearFaltasQtd`. Os últimos da fila são os que
 * caem na janela densa — as faltas que importam são as recentes.
 *
 * Esgotada a fila, o gerador simplesmente deixa de marcar faltas.
 */
function buildNoShowQueue(clients: ClientRow[]): ClientRow[] {
  const igor = clients.find((client) => client.name === 'Igor Sampaio');
  const faltosos = clients.filter((client) => client.segment === 'faltoso' && client.name !== 'Igor Sampaio');
  const others = clients.filter((client) => client.segment === 'ativo' || client.segment === 'mensalista');
  return [
    ...others,
    ...faltosos.flatMap((client) => [client, client]),
    ...(igor ? [igor, igor, igor] : []),
  ];
}

interface AgendaResult {
  appointments: GeneratedAppointment[];
}

function generateAgenda(
  barbers: BarberRow[],
  services: ServiceRow[],
  clients: ClientRow[],
  occupancy: Occupancy,
): AgendaResult {
  const appointments: GeneratedAppointment[] = [];
  const appointmentId = makeIds('apd');

  const active = clients.filter((client) => client.segment !== 'inativo');
  const inactive = clients.filter((client) => client.segment === 'inativo');
  const noShowQueue = buildNoShowQueue(clients);
  let noShowCursor = 0;
  /** `null` quando a cota de faltas do seed acabou — ver `buildNoShowQueue`. */
  const takeNoShowClient = (): ClientRow | null => noShowQueue[noShowCursor++] ?? null;

  /**
   * Faltas por CALENDÁRIO, não por probabilidade.
   *
   * Sortear "8% dos atendimentos" concentrava tudo na janela densa (que tem 20x
   * mais atendimentos por dia que o histórico): o KPI "Faltas (mês)" ficava com
   * um pico solitário num mês e zero no resto. Uma falta a cada 5–9 dias
   * distribui as ~35 faltas da fila uniformemente pelos 8 meses, que é o
   * formato que a sparkline precisa ter.
   */
  let noShowDueDay = -HISTORY_DAYS + randomInt(0, 6);
  const noShowBudgetFor = (dayOffset: number): number => {
    if (dayOffset < noShowDueDay) return 0;
    noShowDueDay = dayOffset + randomInt(5, 9);
    return 1;
  };

  const minutesNow = nowMinutesLocal();

  /** Só quem já estreou pode ser atendido — ver `ClientRow.entryDay`. */
  const arrived = (pool: ClientRow[], dayOffset: number): ClientRow[] => {
    const entered = pool.filter((client) => client.entryDay <= dayOffset);
    return entered.length > 0 ? entered : pool;
  };

  const place = (
    barber: BarberRow,
    dayOffset: number,
    service: ServiceRow,
    client: ClientRow,
    status: AppointmentStatus,
    start: number,
  ): void => {
    const end = start + service.durationMin;
    const startsAt = at(dayOffset, start);
    appointments.push({
      id: appointmentId(),
      barber,
      service,
      client,
      dayOffset,
      startsAt,
      endsAt: addMinutes(startsAt, service.durationMin),
      status,
    });
    occupy(occupancy, barber.id, dayOffset, start, end);
  };

  /** Primeiro horário livre do dia a partir de `from`, na grade de 15min. */
  const findSlot = (barber: BarberRow, dayOffset: number, duration: number, from: number): number | null => {
    const { startTime, endTime, lunchStart, lunchEnd } = barber.schedule;
    for (let start = Math.max(from, startTime); start + duration <= endTime; start += GRID_MINUTES) {
      if (overlaps(start, start + duration, lunchStart, lunchEnd)) continue;
      if (isFree(occupancy, barber.id, dayOffset, start, start + duration)) return start;
    }
    return null;
  };

  /**
   * Primeira visita de quem estreia HOJE. É colocada explicitamente (e não
   * deixada ao sorteio) porque `firstVisitAt` é o eixo do KPI de novos
   * clientes: um cliente que estreia e nunca é sorteado não conta em mês
   * nenhum, e o mês corrente ficaria eternamente em zero.
   */
  const placeFirstVisits = (dayOffset: number, weekday: number, done: AppointmentStatus): void => {
    for (const client of clients) {
      if (client.entryDay !== dayOffset) continue;
      const barber = barbers.find((item) => weekday !== item.schedule.dayOff);
      if (!barber) continue;
      const service = serviceFor(barber);
      const slot = findSlot(barber, dayOffset, service.durationMin, barber.schedule.startTime);
      if (slot === null) continue;
      place(barber, dayOffset, service, client, done, slot);
    }
  };

  const serviceFor = (barber: BarberRow): ServiceRow => {
    const allowed = services.filter((service) => barber.serviceKeys.includes(service.key));
    // Corte e Corte + Barba dominam o movimento real de uma barbearia.
    return pickWeighted(allowed, (service) =>
      service.key === 'corte' ? 34 : service.key === 'corte-barba' ? 24 : service.key === 'barba' ? 16 : 8,
    );
  };

  // ── Histórico esparso: alimenta as sparklines de 8 meses e dá última visita
  //    real aos inativos (perfil com `lastVisitAt` antigo e nenhum atendimento
  //    por trás seria número sem lastro).
  for (let dayOffset = -HISTORY_DAYS; dayOffset < -DETAILED_DAYS; dayOffset += 1) {
    const weekday = localWeekday(dayOffset);
    if (weekday === 0) continue;

    placeFirstVisits(dayOffset, weekday, AppointmentStatus.DONE);
    let noShowBudget = noShowBudgetFor(dayOffset);

    const count = rnd() < HISTORY_APPOINTMENTS_PER_DAY % 1 ? Math.ceil(HISTORY_APPOINTMENTS_PER_DAY) : Math.floor(HISTORY_APPOINTMENTS_PER_DAY);
    for (let index = 0; index < count; index += 1) {
      const barber = pickWeighted(barbers, (item) => DEMO_BARBER_WEIGHTS[item.key]);
      if (weekday === barber.schedule.dayOff) continue;

      const service = serviceFor(barber);
      const slot = findSlot(barber, dayOffset, service.durationMin, barber.schedule.startTime + randomInt(0, 16) * GRID_MINUTES);
      if (slot === null) continue;

      const noShowClient = noShowBudget > 0 ? takeNoShowClient() : null;
      if (noShowClient) noShowBudget -= 1;
      const client =
        noShowClient ??
        (rnd() < 0.45 && inactive.length > 0
          ? pick(arrived(inactive, dayOffset))
          : pick(arrived(active, dayOffset)));

      place(
        barber,
        dayOffset,
        service,
        client,
        noShowClient ? AppointmentStatus.NO_SHOW : AppointmentStatus.DONE,
        slot,
      );
    }
  }

  // ── Janela densa: últimos 30 dias + hoje.
  for (let dayOffset = -DETAILED_DAYS; dayOffset <= 0; dayOffset += 1) {
    const weekday = localWeekday(dayOffset);
    if (weekday === 0) continue;

    placeFirstVisits(dayOffset, weekday, AppointmentStatus.DONE);
    let noShowBudget = noShowBudgetFor(dayOffset);

    for (const barber of barbers) {
      if (weekday === barber.schedule.dayOff) continue;

      const already = (occupancy.get(`${barber.id}|${dayOffset}`) ?? []).length;
      const target = Math.max(
        1,
        Math.round(
          (randomInt(APPOINTMENTS_PER_BARBER_MIN, APPOINTMENTS_PER_BARBER_MAX) *
            DEMO_BARBER_WEIGHTS[barber.key]) /
            NEUTRAL_WEIGHT,
        ),
      );
      let cursor = barber.schedule.startTime;

      for (let index = already; index < target; index += 1) {
        const service = serviceFor(barber);
        const slot = findSlot(barber, dayOffset, service.durationMin, cursor);
        if (slot === null) break;
        cursor = slot + service.durationMin + randomInt(0, 2) * GRID_MINUTES;

        // Hoje o passado é passado: o que já aconteceu está concluído, o que
        // ainda vai acontecer está confirmado ou aguardando.
        const past = dayOffset < 0 || slot + service.durationMin <= minutesNow;
        const roll = rnd();
        let status: AppointmentStatus;
        let client: ClientRow | null = null;

        if (past) {
          if (noShowBudget > 0 && roll < 0.25) {
            // Falta só se o dia tinha cota E ainda há cliente na fila; senão o
            // horário vira cancelamento, e não uma falta a mais em cima de
            // quem já tem duas.
            client = takeNoShowClient();
            if (client) noShowBudget -= 1;
            status = client ? AppointmentStatus.NO_SHOW : AppointmentStatus.CANCELED;
          } else {
            status = roll < 0.06 ? AppointmentStatus.CANCELED : AppointmentStatus.DONE;
          }
        } else {
          status = roll < 0.6 ? AppointmentStatus.CONFIRMED : AppointmentStatus.SCHEDULED;
        }

        client ??= pick(arrived(active, dayOffset));

        place(barber, dayOffset, service, client, status, slot);
      }
    }
  }

  // ── Próximos 7 dias (o seed base já cobriu amanhã).
  for (let dayOffset = 1; dayOffset <= FUTURE_DAYS; dayOffset += 1) {
    const weekday = localWeekday(dayOffset);
    if (weekday === 0) continue;

    for (const barber of barbers) {
      if (weekday === barber.schedule.dayOff) continue;
      const target = randomInt(1, 3);
      let cursor = barber.schedule.startTime;

      for (let index = 0; index < target; index += 1) {
        const service = serviceFor(barber);
        const slot = findSlot(barber, dayOffset, service.durationMin, cursor);
        if (slot === null) break;
        cursor = slot + service.durationMin + randomInt(1, 4) * GRID_MINUTES;
        place(
          barber,
          dayOffset,
          service,
          pick(active),
          rnd() < 0.55 ? AppointmentStatus.CONFIRMED : AppointmentStatus.SCHEDULED,
          slot,
        );
      }
    }
  }

  return { appointments };
}

async function persistAgenda(tenantId: string, appointments: GeneratedAppointment[]): Promise<void> {
  const serviceRowId = makeIds('asd');

  await prisma.appointment.createMany({
    data: appointments.map((appointment, index) => ({
      id: appointment.id,
      tenantId,
      bookingCode: `AG-D${String(index + 1).padStart(4, '0')}`,
      barberId: appointment.barber.id,
      serviceId: appointment.service.id,
      clientId: appointment.client.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      origin: index % 3 === 0 ? AppointmentOrigin.DASHBOARD : AppointmentOrigin.PUBLIC,
      priceCents: appointment.service.priceCents,
      confirmedAt:
        appointment.status === AppointmentStatus.CONFIRMED || appointment.status === AppointmentStatus.DONE
          ? addMinutes(appointment.startsAt, -180)
          : null,
      canceledAt: appointment.status === AppointmentStatus.CANCELED ? addMinutes(appointment.startsAt, -240) : null,
      cancelReason: appointment.status === AppointmentStatus.CANCELED ? 'Imprevisto do cliente' : null,
      createdAt: addMinutes(appointment.startsAt, -randomInt(1, 20) * 60),
      // `updatedAt` é `@updatedAt`, mas o Prisma deixa gravar explicitamente —
      // e aqui PRECISA. O sino da topbar lista confirmações e cancelamentos
      // cujo `updatedAt` cai HOJE; com o default, os 850 agendamentos do seed
      // nasceriam "atualizados agora" e o feed viraria uma lista aleatória de
      // eventos de meses atrás.
      updatedAt:
        appointment.status === AppointmentStatus.CANCELED
          ? addMinutes(appointment.startsAt, -240)
          : appointment.status === AppointmentStatus.CONFIRMED
            ? addMinutes(appointment.startsAt, -180)
            : appointment.status === AppointmentStatus.DONE
              ? appointment.endsAt
              : addMinutes(appointment.startsAt, -randomInt(1, 20) * 60),
    })),
  });

  await prisma.appointmentService.createMany({
    data: appointments.map((appointment) => ({
      id: serviceRowId(),
      tenantId,
      appointmentId: appointment.id,
      serviceId: appointment.service.id,
      sortOrder: 0,
      priceCents: appointment.service.priceCents,
      durationMin: appointment.service.durationMin,
    })),
  });
}

// ══════════════════════════════════════════════════════════════ Comandas ════

interface GeneratedOrder {
  id: string;
  number: number;
  barberId: string;
  barberKey: DemoBarberKey;
  clientId: string;
  appointmentId: string | null;
  closedAt: Date;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountType: DiscountType | null;
  discountValue: number;
  serviceItem: { id: string; serviceId: string; priceCents: number };
  productItem: { id: string; productId: string; priceCents: number } | null;
  payments: Array<{ method: PaymentMethod; amountCents: number }>;
}

async function seedOrders(
  tenantId: string,
  appointments: GeneratedAppointment[],
  clients: ClientRow[],
  barbers: BarberRow[],
  services: ServiceRow[],
): Promise<GeneratedOrder[]> {
  const products = await prisma.product.findMany({
    where: { tenantId },
    select: { id: true, name: true, priceCents: true },
    orderBy: { name: 'asc' },
  });

  const lastNumber = await prisma.order.aggregate({ where: { tenantId }, _max: { number: true } });
  let orderNumber = (lastNumber._max.number ?? 0) + 1;

  const orderId = makeIds('ord');
  const itemId = makeIds('oid');
  const orders: GeneratedOrder[] = [];

  const done = appointments
    .filter((appointment) => appointment.status === AppointmentStatus.DONE)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (const appointment of done) {
    orders.push(
      buildOrder({
        id: orderId(),
        number: orderNumber++,
        barber: appointment.barber,
        clientId: appointment.client.id,
        appointmentId: appointment.id,
        closedAt: addMinutes(appointment.endsAt, randomInt(2, 25)),
        service: { id: appointment.service.id, priceCents: appointment.service.priceCents },
        products,
        itemId,
      }),
    );
  }

  // Walk-ins: comanda de balcão, sem agendamento por trás. Existem para a aba
  // Comandas não parecer um espelho 1:1 da agenda — que não é o que acontece
  // numa barbearia de verdade.
  for (let dayOffset = -DETAILED_DAYS; dayOffset <= 0; dayOffset += 1) {
    if (localWeekday(dayOffset) === 0) continue;
    for (let index = 0; index < randomInt(0, 2); index += 1) {
      const barber = pickWeighted(barbers, (item) => DEMO_BARBER_WEIGHTS[item.key]);
      const service = pick(services.filter((item) => barber.serviceKeys.includes(item.key)));
      const closedAt = at(dayOffset, randomInt(barber.schedule.startTime / 15, barber.schedule.endTime / 15 - 1) * 15);
      if (closedAt.getTime() > Date.now()) continue;

      orders.push(
        buildOrder({
          id: orderId(),
          number: orderNumber++,
          barber,
          clientId: pick(clients.filter((client) => client.segment !== 'inativo')).id,
          appointmentId: null,
          closedAt,
          service: { id: service.id, priceCents: service.priceCents },
          products,
          itemId,
        }),
      );
    }
  }

  orders.sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());

  await prisma.order.createMany({
    data: orders.map((order) => ({
      id: order.id,
      tenantId,
      number: order.number,
      clientId: order.clientId,
      barberId: order.barberId,
      appointmentId: order.appointmentId,
      status: OrderStatus.CLOSED,
      subtotalCents: order.subtotalCents,
      discountType: order.discountType,
      discountValue: order.discountValue,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
      openedAt: addMinutes(order.closedAt, -60),
      closedAt: order.closedAt,
      createdAt: addMinutes(order.closedAt, -60),
    })),
  });

  await prisma.orderItem.createMany({
    data: orders.flatMap((order) => [
      {
        id: order.serviceItem.id,
        tenantId,
        orderId: order.id,
        kind: OrderItemKind.SERVICE,
        serviceId: order.serviceItem.serviceId,
        barberId: order.barberId,
        description: services.find((service) => service.id === order.serviceItem.serviceId)!.name,
        quantity: 1,
        unitPriceCents: order.serviceItem.priceCents,
        totalCents: order.serviceItem.priceCents,
        createdAt: order.closedAt,
      },
      ...(order.productItem
        ? [
            {
              id: order.productItem.id,
              tenantId,
              orderId: order.id,
              kind: OrderItemKind.PRODUCT,
              productId: order.productItem.productId,
              barberId: order.barberId,
              description: products.find((product) => product.id === order.productItem!.productId)!.name,
              quantity: 1,
              unitPriceCents: order.productItem.priceCents,
              totalCents: order.productItem.priceCents,
              createdAt: order.closedAt,
            },
          ]
        : []),
    ]),
  });

  await prisma.payment.createMany({
    data: orders.flatMap((order) =>
      order.payments.map((payment) => ({
        tenantId,
        orderId: order.id,
        method: payment.method,
        status: PaymentStatus.PAID,
        amountCents: payment.amountCents,
        paidAt: order.closedAt,
        createdAt: order.closedAt,
      })),
    ),
  });

  await seedOpenOrders(tenantId, barbers, services, clients, products, orderNumber, orderId, itemId);

  return orders;
}

function buildOrder(params: {
  id: string;
  number: number;
  barber: BarberRow;
  clientId: string;
  appointmentId: string | null;
  closedAt: Date;
  service: { id: string; priceCents: number };
  products: Array<{ id: string; priceCents: number }>;
  itemId: () => string;
}): GeneratedOrder {
  const productRoll = rnd();
  const product = productRoll < 0.26 ? pick(params.products) : null;
  const subtotalCents = params.service.priceCents + (product?.priceCents ?? 0);

  // ~8% das comandas saem com desconto — o campo existe na tela e precisa de
  // linha real para a auditoria conferir a coluna "Desconto".
  let discountType: DiscountType | null = null;
  let discountValue = 0;
  let discountCents = 0;
  const discountRoll = rnd();
  if (discountRoll < 0.05) {
    discountType = DiscountType.PERCENT;
    discountValue = 1_000; // 10% em basis points
    discountCents = Math.round(subtotalCents * 0.1);
  } else if (discountRoll < 0.08) {
    discountType = DiscountType.FIXED;
    discountValue = 500;
    discountCents = Math.min(500, subtotalCents);
  }

  const totalCents = subtotalCents - discountCents;

  // ~6% com pagamento dividido ("Dividir" do protótipo).
  const payments =
    rnd() < 0.06 && totalCents > 1_000
      ? [
          { method: PaymentMethod.PIX, amountCents: Math.round(totalCents / 2) },
          { method: PaymentMethod.CREDIT, amountCents: totalCents - Math.round(totalCents / 2) },
        ]
      : [{ method: pickPaymentMethod(), amountCents: totalCents }];

  return {
    id: params.id,
    number: params.number,
    barberId: params.barber.id,
    barberKey: params.barber.key,
    clientId: params.clientId,
    appointmentId: params.appointmentId,
    closedAt: params.closedAt,
    subtotalCents,
    discountCents,
    totalCents,
    discountType,
    discountValue,
    serviceItem: { id: params.itemId(), serviceId: params.service.id, priceCents: params.service.priceCents },
    productItem: product ? { id: params.itemId(), productId: product.id, priceCents: product.priceCents } : null,
    payments,
  };
}

function pickPaymentMethod(): PaymentMethod {
  const roll = rnd();
  if (roll < 0.42) return PaymentMethod.PIX;
  if (roll < 0.66) return PaymentMethod.CREDIT;
  if (roll < 0.82) return PaymentMethod.DEBIT;
  return PaymentMethod.CASH;
}

/** As 3 comandas abertas "agora" da auditoria (o seed base já deixa 2). */
async function seedOpenOrders(
  tenantId: string,
  barbers: BarberRow[],
  services: ServiceRow[],
  clients: ClientRow[],
  products: Array<{ id: string; name: string; priceCents: number }>,
  startNumber: number,
  orderId: () => string,
  itemId: () => string,
): Promise<void> {
  // Fecha as duas do seed base para a aba abrir com exatamente 3 abertas.
  await prisma.order.deleteMany({ where: { tenantId, status: OrderStatus.OPEN } });

  const active = clients.filter((client) => client.segment !== 'inativo');
  let number = startNumber;

  for (let index = 0; index < 3; index += 1) {
    const barber = barbers[index % barbers.length]!;
    const service = pick(services.filter((item) => barber.serviceKeys.includes(item.key)));
    const product = index === 0 ? products[0] : null;
    const subtotal = service.priceCents + (product?.priceCents ?? 0);
    const id = orderId();

    await prisma.order.create({
      data: {
        id,
        tenantId,
        number: number++,
        clientId: pick(active).id,
        barberId: barber.id,
        status: OrderStatus.OPEN,
        subtotalCents: subtotal,
        totalCents: subtotal,
        openedAt: addMinutes(new Date(), -randomInt(10, 90)),
        items: {
          create: [
            {
              id: itemId(),
              tenantId,
              kind: OrderItemKind.SERVICE,
              serviceId: service.id,
              barberId: barber.id,
              description: service.name,
              quantity: 1,
              unitPriceCents: service.priceCents,
              totalCents: service.priceCents,
            },
            ...(product
              ? [
                  {
                    id: itemId(),
                    tenantId,
                    kind: OrderItemKind.PRODUCT,
                    productId: product.id,
                    barberId: barber.id,
                    description: product.name,
                    quantity: 1,
                    unitPriceCents: product.priceCents,
                    totalCents: product.priceCents,
                  },
                ]
              : []),
          ],
        },
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════ Comissões ══════

/**
 * Mesma regra do `CommissionCalcService`: a faixa sai do faturamento ACUMULADO
 * do barbeiro no mês de competência, comanda a comanda, e produto não gera
 * comissão. Replicar a fórmula (em vez de inventar um percentual) é o que faz
 * a aba Comissões bater com a aba Comandas.
 */
async function seedCommissions(tenantId: string, orders: GeneratedOrder[], barbers: BarberRow[]): Promise<void> {
  const cumulative = new Map<string, number>();
  const rows: Prisma.CommissionEntryCreateManyInput[] = [];

  for (const order of orders) {
    const barber = barbers.find((item) => item.id === order.barberId)!;
    const rule = barber.rule;
    if (!rule || order.serviceItem.priceCents <= 0) continue;

    const referenceMonth = monthStartOf(order.closedAt);
    const key = `${barber.id}|${referenceMonth.toISOString()}`;
    const accumulated = (cumulative.get(key) ?? 0) + order.serviceItem.priceCents;
    cumulative.set(key, accumulated);

    const percentBps =
      rule.type === CommissionRuleType.FIXED
        ? rule.percentBps ?? 0
        : ([...rule.tiers].sort((a, b) => a.sortOrder - b.sortOrder).find(
            (tier) => tier.upToCents === null || accumulated <= tier.upToCents,
          )?.percentBps ?? 0);

    rows.push({
      tenantId,
      barberId: barber.id,
      orderId: order.id,
      orderItemId: order.serviceItem.id,
      referenceMonth,
      baseCents: order.serviceItem.priceCents,
      percentBps,
      amountCents: Math.round((order.serviceItem.priceCents * percentBps) / 10_000),
      // Meses anteriores já foram fechados e pagos; o mês corrente está em
      // aberto — é o que a tela de Comissões espera encontrar.
      kind: CommissionEntryKind.SERVICE,
      status: referenceMonth < currentMonthStart() ? CommissionEntryStatus.PAID : CommissionEntryStatus.PENDING,
      paidAt: referenceMonth < currentMonthStart() ? addMinutes(order.closedAt, 60 * 24 * 30) : null,
      createdAt: order.closedAt,
    });

    // Comissão de PRODUTO — percentual único da regra, sem faixa (o acumulado
    // acima conta só serviço, que é o que escolhe a faixa). É esta linha que
    // enche a coluna "Comissão produtos" da aba.
    if (order.productItem && rule.percentProdutosBps > 0) {
      rows.push({
        tenantId,
        barberId: barber.id,
        orderId: order.id,
        orderItemId: order.productItem.id,
        referenceMonth,
        baseCents: order.productItem.priceCents,
        percentBps: rule.percentProdutosBps,
        amountCents: Math.round((order.productItem.priceCents * rule.percentProdutosBps) / 10_000),
        kind: CommissionEntryKind.PRODUCT,
        status: referenceMonth < currentMonthStart() ? CommissionEntryStatus.PAID : CommissionEntryStatus.PENDING,
        paidAt: referenceMonth < currentMonthStart() ? addMinutes(order.closedAt, 60 * 24 * 30) : null,
        createdAt: order.closedAt,
      });
    }
  }

  await prisma.commissionEntry.createMany({ data: rows });
}

// ═══════════════════════════════════════════════════ Perfis dos clientes ════

/**
 * Recalcula os agregados do perfil a partir das comandas e das faltas
 * geradas — o mesmo que `OrdersService.close()` mantém incrementalmente. É
 * daqui que saem os 12+ inativos do alerta da home: eles são inativos porque a
 * última comanda deles é antiga, não porque um campo foi cravado.
 */
async function syncClientProfiles(
  tenantId: string,
  clients: ClientRow[],
  orders: GeneratedOrder[],
  appointments: GeneratedAppointment[],
): Promise<void> {
  const stats = new Map<string, { visits: number; spent: number; first: Date; last: Date }>();

  for (const order of orders) {
    const current = stats.get(order.clientId);
    if (!current) {
      stats.set(order.clientId, {
        visits: 1,
        spent: order.totalCents,
        first: order.closedAt,
        last: order.closedAt,
      });
      continue;
    }
    current.visits += 1;
    current.spent += order.totalCents;
    if (order.closedAt < current.first) current.first = order.closedAt;
    if (order.closedAt > current.last) current.last = order.closedAt;
  }

  const noShows = new Map<string, number>();
  for (const appointment of appointments) {
    if (appointment.status !== AppointmentStatus.NO_SHOW) continue;
    noShows.set(appointment.client.id, (noShows.get(appointment.client.id) ?? 0) + 1);
  }

  const blockThreshold = 3;

  for (const client of clients) {
    const stat = stats.get(client.id);
    const noShowCount = noShows.get(client.id) ?? 0;

    await prisma.clientProfile.update({
      where: { id: client.profileId },
      data: {
        visitCount: stat?.visits ?? 0,
        totalSpentCents: stat?.spent ?? 0,
        firstVisitAt: stat?.first ?? null,
        lastVisitAt: stat?.last ?? null,
        noShowCount,
        blocked: noShowCount >= blockThreshold,
      },
    });
  }
}

// ══════════════════════════════════════════════════════════ Assinaturas ═════

/**
 * 5 assinantes (3 do seed base + 2 do demo), com uso PARCIAL do ciclo e uma
 * cobrança recusada. O uso não é chutado: as comandas do período viram itens
 * cobertos pela assinatura (preço 0, `coveredBySubscription`), e `used` é a
 * contagem dessas comandas — é assim que a aba Fidelidade e a comanda contam a
 * mesma história.
 */
async function seedSubscriptions(tenantId: string, clients: ClientRow[], orders: GeneratedOrder[]): Promise<number> {
  const periodStart = currentMonthStart();
  const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
  const nextChargeAt = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, CLIENT_PLAN_BILLING_DAY),
  );

  const plans = await prisma.clientPlan.findMany({
    where: { tenantId },
    select: { id: true, name: true, priceCents: true, items: { select: { serviceId: true, quota: true } } },
  });

  const mensalistas = clients.filter((client) => client.segment === 'mensalista');
  const newcomers = [
    { client: mensalistas[0], planName: 'Corte Semanal', status: SubscriptionStatus.ACTIVE },
    { client: mensalistas[1], planName: 'Clube Completo', status: SubscriptionStatus.PAST_DUE },
  ];

  for (const entry of newcomers) {
    if (!entry.client) continue;
    const plan = plans.find((item) => item.name === entry.planName)!;

    await prisma.clientSubscription.create({
      data: {
        tenantId,
        clientId: entry.client.id,
        planId: plan.id,
        status: entry.status,
        startedAt: daysFromNow(-120),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextChargeAt,
        usages: {
          create: plan.items.map((item) => ({
            tenantId,
            serviceId: item.serviceId,
            periodStart,
            periodEnd,
            quota: item.quota,
            used: 0,
          })),
        },
      },
    });
  }

  const subscriptions = await prisma.clientSubscription.findMany({
    where: { tenantId },
    select: {
      id: true,
      clientId: true,
      status: true,
      plan: { select: { priceCents: true } },
      usages: { select: { id: true, serviceId: true, quota: true } },
    },
  });

  let covered = 0;

  for (const subscription of subscriptions) {
    // Comandas DESTE assinante, no ciclo corrente, cujo serviço o plano cobre.
    const candidates = orders.filter(
      (order) =>
        order.clientId === subscription.clientId &&
        order.closedAt >= periodStart &&
        subscription.usages.some((usage) => usage.serviceId === order.serviceItem.serviceId),
    );

    for (const usage of subscription.usages) {
      const matching = candidates.filter((order) => order.serviceItem.serviceId === usage.serviceId);
      // Parcial de propósito: no máximo `quota - 1`, para a barra de uso do
      // ciclo nunca aparecer cheia (e o débito atômico continuar testável).
      const used = Math.min(matching.length, Math.max(0, usage.quota - 1));
      if (used === 0) continue;

      for (const order of matching.slice(0, used)) {
        const newSubtotal = order.subtotalCents - order.serviceItem.priceCents;
        // O desconto acompanha o novo subtotal (mesma conta do
        // `OrdersService.close`): percentual recalcula sobre o que sobrou,
        // fixo nunca passa do subtotal. Sem isto, uma comanda só de serviço
        // coberto ficava com desconto maior que o próprio total.
        const newDiscount =
          order.discountType === DiscountType.PERCENT
            ? Math.round((newSubtotal * order.discountValue) / 10_000)
            : order.discountType === DiscountType.FIXED
              ? Math.min(order.discountValue, newSubtotal)
              : 0;
        const newTotal = newSubtotal - newDiscount;

        await prisma.orderItem.update({
          where: { id: order.serviceItem.id },
          data: {
            coveredBySubscription: true,
            subscriptionUsageId: usage.id,
            unitPriceCents: 0,
            totalCents: 0,
          },
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { subtotalCents: newSubtotal, discountCents: newDiscount, totalCents: newTotal },
        });
        // O pagamento vira o da assinatura: o dinheiro do corte já entrou na
        // mensalidade, e a comanda só cobra o que sobrou (produto, se houver).
        await prisma.payment.deleteMany({ where: { orderId: order.id } });
        await prisma.payment.create({
          data: {
            tenantId,
            orderId: order.id,
            method: PaymentMethod.SUBSCRIPTION,
            status: PaymentStatus.PAID,
            amountCents: newTotal,
            paidAt: order.closedAt,
          },
        });
        // Sem faturamento de serviço, não há comissão sobre ele (mesma regra
        // do `recordServiceEntry`, que ignora base zero).
        await prisma.commissionEntry.deleteMany({ where: { orderItemId: order.serviceItem.id } });

        order.subtotalCents = newSubtotal;
        order.discountCents = newDiscount;
        order.totalCents = newTotal;
        order.serviceItem.priceCents = 0;
        order.payments = [{ method: PaymentMethod.SUBSCRIPTION, amountCents: newTotal }];
        covered += 1;
      }

      await prisma.subscriptionUsage.update({ where: { id: usage.id }, data: { used } });
    }

    // Cobrança da mensalidade: aprovada em todas, menos na `PAST_DUE`, que
    // guarda a recusa do driver mock (o fluxo de cobrança tem o que testar).
    const failed = subscription.status === SubscriptionStatus.PAST_DUE;
    await prisma.payment.create({
      data: {
        tenantId,
        clientSubscriptionId: subscription.id,
        method: PaymentMethod.CREDIT,
        status: failed ? PaymentStatus.FAILED : PaymentStatus.PAID,
        amountCents: subscription.plan.priceCents,
        paidAt: failed ? null : periodStart,
        metadata: failed ? { reason: 'INSUFFICIENT_FUNDS', driver: 'mock' } : { driver: 'mock' },
        createdAt: periodStart,
      },
    });
  }

  return covered;
}

// ═══════════════════════════════════════════════════════════════ Caixa ══════

/**
 * Caixa de ONTEM fechado e conferido, e NENHUM caixa aberto hoje — é essa
 * ausência que acende o alerta "Caixa ainda não foi aberto hoje" da home e do
 * sino. O seed base deixava um caixa aberto, então ele é substituído aqui.
 */
async function seedCashRegister(tenantId: string, userId: string, orders: GeneratedOrder[]): Promise<void> {
  await prisma.cashRegister.deleteMany({ where: { tenantId } });

  const yesterday = openDay(-1);
  const dayStart = localMidnight(yesterday);
  const dayEnd = localMidnight(yesterday + 1);
  const openingCents = 20_000;

  // TODA comanda do dia entra no extrato do caixa, uma linha por forma de
  // pagamento — é assim que o fechamento fecha (a produção faz o mesmo em
  // `OrdersService.close`). A conferência é que filtra só o dinheiro.
  const daySales = orders.filter(
    (order) => order.closedAt >= dayStart && order.closedAt < dayEnd,
  );

  const salesTotal = daySales.reduce(
    (sum, order) =>
      sum +
      order.payments
        .filter((payment) => payment.method === PaymentMethod.CASH)
        .reduce((inner, payment) => inner + payment.amountCents, 0),
    0,
  );
  const withdrawalCents = -5_000;
  const expectedCents = openingCents + salesTotal + withdrawalCents;
  // Diferença de R$ 2,00 a menos: a conferência de caixa só é conferência se
  // existir uma linha em que ela não bate.
  const countedCents = expectedCents - 200;

  const register = await prisma.cashRegister.create({
    data: {
      tenantId,
      openedByUserId: userId,
      status: CashRegisterStatus.CLOSED,
      openingCents,
      expectedCents,
      countedCents,
      differenceCents: countedCents - expectedCents,
      openedAt: at(yesterday, 9 * 60),
      closedAt: at(yesterday, 20 * 60),
      notes: 'Fechamento normal; diferença de R$ 2,00 lançada como quebra de caixa.',
    },
    select: { id: true },
  });

  await prisma.cashMovement.createMany({
    data: [
      {
        tenantId,
        cashRegisterId: register.id,
        type: CashMovementType.OPENING,
        amountCents: openingCents,
        description: 'Abertura do caixa',
        method: PaymentMethod.CASH,
        category: 'Abertura',
        createdByUserId: userId,
        createdAt: at(yesterday, 9 * 60),
      },
      ...daySales.flatMap((order) =>
        order.payments.map((payment) => ({
          tenantId,
          cashRegisterId: register.id,
          type: CashMovementType.SALE,
          amountCents: payment.amountCents,
          description: `Comanda #${order.number}`,
          method: payment.method,
          category: order.productItem ? 'Serviço + Produto' : 'Serviço',
          orderId: order.id,
          createdByUserId: userId,
          createdAt: order.closedAt,
        })),
      ),
      {
        tenantId,
        cashRegisterId: register.id,
        type: CashMovementType.WITHDRAWAL,
        amountCents: withdrawalCents,
        description: 'Compra de café e insumos',
        method: PaymentMethod.CASH,
        category: 'Compra de produto',
        createdByUserId: userId,
        createdAt: at(yesterday, 16 * 60),
      },
      {
        tenantId,
        cashRegisterId: register.id,
        type: CashMovementType.CLOSING,
        amountCents: 0,
        description: `Fechamento — conferido ${(countedCents / 100).toFixed(2)}`,
        category: 'Fechamento',
        createdByUserId: userId,
        createdAt: at(yesterday, 20 * 60),
      },
    ],
  });
}

// ══════════════════════════════════════════════════════════ Financeiro ══════

async function seedFinanceExtras(tenantId: string): Promise<void> {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { tenantId, name: 'Nubank PJ' },
    select: { id: true },
  });

  await prisma.accountPayable.createMany({
    data: DEMO_EXTRA_PAYABLES.map((account) => ({
      tenantId,
      description: account.description,
      category: account.category,
      supplier: account.supplier,
      amountCents: account.amountCents,
      dueDate: dateOnly(account.dueInDays),
      status: AccountStatus.PENDING,
      bankAccountId: bankAccount?.id ?? null,
    })),
  });
}

// ══════════════════════════════════════════ Calculadora de preço (Avançado) ══

/**
 * Custos fixos da calculadora do tenant demo. Só a lista e o custo variável —
 * os demais parâmetros o `PriceCalculatorService` deriva do tenant, e gravar
 * um `PriceCalculatorConfig` aqui esconderia essa derivação atrás de um valor
 * fixo. O demo grava o registro mesmo assim, porque é a única forma de a lista
 * de custos existir; os parâmetros salvos são os MESMOS que o serviço
 * calcularia num primeiro acesso.
 */
async function seedPriceCalculator(tenantId: string): Promise<void> {
  const [rules, doneLast30, services] = await Promise.all([
    prisma.commissionRule.findMany({
      where: { tenantId, active: true },
      select: {
        type: true,
        percentBps: true,
        tiers: { select: { percentBps: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    }),
    prisma.appointment.count({
      where: {
        tenantId,
        status: AppointmentStatus.DONE,
        startsAt: { gte: daysFromNow(-30) },
      },
    }),
    prisma.service.findMany({
      where: { tenantId, deletedAt: null, active: true },
      select: { priceCents: true },
    }),
  ]);

  const percents = rules.map((rule) =>
    rule.type === CommissionRuleType.FIXED ? (rule.percentBps ?? 0) : (rule.tiers[0]?.percentBps ?? 0),
  );

  await prisma.priceCalculatorConfig.create({
    data: {
      tenantId,
      custoVariavelCents: DEMO_PRICE_CALC_VARIAVEL_CENTS,
      comissaoMediaBps:
        percents.length > 0
          ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length)
          : 0,
      atendimentosMes: Math.min(1200, Math.max(100, doneLast30)),
      margemBps: 2000,
      precoPraticadoCents:
        services.length > 0
          ? Math.round(services.reduce((sum, service) => sum + service.priceCents, 0) / services.length)
          : 0,
    },
  });

  await prisma.priceCalcFixedCost.createMany({
    data: DEMO_PRICE_CALC_FIXED_COSTS.map((cost, index) => ({
      tenantId,
      name: cost.name,
      amountCents: cost.amountCents,
      sortOrder: index,
    })),
  });
}

// ═════════════════════════════════════════════════════════════ Estoque ══════

/**
 * Estoque final coerente com as vendas do período.
 *
 * O schema não tem razão de estoque (não existe tabela de movimento), então o
 * que dá para deixar coerente é o ESTADO: o estoque gravado é o que sobrou
 * depois das `sold` unidades vendidas nas comandas acima, e exatamente dois
 * produtos terminam no ou abaixo do mínimo — os dois que acendem o card
 * "estoque baixo" da home e o item do sino. Os demais são repostos acima do
 * mínimo para que o alerta conte 2, e não "quase todos".
 */
async function syncStock(tenantId: string, orders: GeneratedOrder[]): Promise<number> {
  const sold = new Map<string, number>();
  for (const order of orders) {
    if (!order.productItem) continue;
    sold.set(order.productItem.productId, (sold.get(order.productItem.productId) ?? 0) + 1);
  }

  const products = await prisma.product.findMany({
    where: { tenantId },
    select: { id: true, name: true, stock: true, estoqueMin: true },
  });

  for (const product of products) {
    const target = LOW_STOCK_PRODUCTS.includes(product.name)
      ? Math.max(0, product.estoqueMin - randomInt(1, 3))
      : Math.max(product.estoqueMin + 3, product.stock);
    await prisma.product.update({ where: { id: product.id }, data: { stock: target } });
  }

  return [...sold.values()].reduce((sum, quantity) => sum + quantity, 0);
}

// ═══════════════════════════════════════════════════════ Outbox e sino ══════

/**
 * Fila do WhatsApp: confirmações já enviadas, lembretes agendados para os
 * próximos dias e uma falha. É o dado da aba WhatsApp e do outbox do super
 * admin — e o `MockNotificationDriver` grava exatamente neste formato.
 */
async function seedOutbox(tenantId: string, appointments: GeneratedAppointment[]): Promise<number> {
  const confirmation = WHATSAPP_TEMPLATES.find((template) => template.event === 'CONFIRMATION')!;
  const reminder = WHATSAPP_TEMPLATES.find((template) => template.event === 'REMINDER')!;

  /** `dd/MM` e `HH:mm` no fuso do tenant — `toLocaleString` seguiria o TZ do host. */
  const localParts = (instant: Date): { date: string; time: string } => {
    const iso = new Date(instant.getTime() + TZ_OFFSET_MINUTES * 60_000).toISOString();
    return { date: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, time: iso.slice(11, 16) };
  };

  const render = (template: string, appointment: GeneratedAppointment): string =>
    template
      .replace('{nome}', appointment.client.name.split(' ')[0] as string)
      .replace('{data}', localParts(appointment.startsAt).date)
      .replace('{horario}', localParts(appointment.startsAt).time)
      .replace('{servico}', appointment.service.name)
      .replace('{barbeiro}', appointment.barber.name)
      .replace('{link_agendamento}', `https://barbervp.app/${DEMO_TENANT.slug}`);

  const recent = appointments
    .filter((appointment) => appointment.dayOffset >= -3 && appointment.dayOffset <= 0)
    .slice(0, 8);
  // A partir de depois de amanhã: o lembrete sai 24h antes, e para um
  // atendimento de amanhã ele já nasceria vencido — o dreno da fila (fase 09)
  // o entregaria no primeiro minuto de API no ar, e a aba WhatsApp abriria sem
  // nenhuma mensagem no estado "agendada".
  const upcoming = appointments.filter((appointment) => appointment.dayOffset >= 2).slice(0, 7);

  const rows: Prisma.NotificationOutboxCreateManyInput[] = [
    ...recent.map((appointment, index) => ({
      tenantId,
      channel: NotificationChannel.WHATSAPP,
      recipient: appointment.client.phone,
      templateKey: WhatsappEvent.CONFIRMATION,
      body: render(confirmation.template, appointment),
      status: index === 3 ? OutboxStatus.FAILED : OutboxStatus.SENT,
      attempts: index === 3 ? 3 : 1,
      sentAt: index === 3 ? null : addMinutes(appointment.startsAt, -240),
      error: index === 3 ? 'Número inválido para WhatsApp (mock driver)' : null,
      createdAt: addMinutes(appointment.startsAt, -245),
    })),
    ...upcoming.map((appointment) => ({
      tenantId,
      channel: NotificationChannel.WHATSAPP,
      recipient: appointment.client.phone,
      templateKey: WhatsappEvent.REMINDER,
      body: render(reminder.template, appointment),
      status: OutboxStatus.PENDING,
      attempts: 0,
      scheduledFor: addMinutes(appointment.startsAt, -(reminder.offsetMinutes ?? 1_440)),
      createdAt: new Date(),
    })),
  ];

  await prisma.notificationOutbox.createMany({ data: rows });
  return rows.length;
}

// ═══════════════════════════════════════════════════════════ Auditoria ══════

async function seedAuditLog(tenantId: string, users: { owner: string; manager: string }): Promise<void> {
  const entries = [
    { action: 'auth.login', entity: 'User', actor: users.owner, daysAgo: 0 },
    { action: 'auth.login', entity: 'User', actor: users.manager, daysAgo: 0 },
    { action: 'auth.login', entity: 'User', actor: users.owner, daysAgo: 1 },
    { action: 'auth.login_failed', entity: 'User', actor: null, daysAgo: 2 },
    { action: 'tenant.settings_updated', entity: 'TenantSettings', actor: users.owner, daysAgo: 3 },
    { action: 'admin.tenant_plan_changed', entity: 'Tenant', actor: users.owner, daysAgo: 12 },
    { action: 'finance.cash_register_closed', entity: 'CashRegister', actor: users.manager, daysAgo: 1 },
    { action: 'team.staff_invited', entity: 'StaffInvite', actor: users.owner, daysAgo: 1 },
    { action: 'commissions.period_closed', entity: 'CommissionEntry', actor: users.owner, daysAgo: 25 },
    { action: 'catalog.product_updated', entity: 'Product', actor: users.manager, daysAgo: 5 },
  ];

  await prisma.auditLog.createMany({
    data: entries.map((entry) => ({
      tenantId,
      actorUserId: entry.actor,
      action: entry.action,
      entity: entry.entity,
      ip: '198.51.100.24',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) BarberVP-Seed',
      // A marca é o que torna a limpeza possível: `AuditLog.tenantId` vira
      // `null` quando o tenant cai, e sem ela a linha ficaria órfã para sempre.
      metadata: { seed: 'demo' },
      createdAt: daysFromNow(-entry.daysAgo),
    })),
  });
}

// ════════════════════════════════════════════════════════ Assistente IA ═════

async function seedAssistant(tenantId: string, userId: string, pairs: number): Promise<void> {
  const rows: Prisma.AiChatMessageCreateManyInput[] = [];
  const monthStart = currentMonthStart();

  DEMO_AI_CONVERSATION.slice(0, pairs).forEach((exchange, index) => {
    // A cota é contada no mês corrente: as mensagens têm de cair dentro dele,
    // mesmo quando o seed roda no dia 1.
    const when = new Date(
      Math.max(monthStart.getTime() + index * 60_000, Date.now() - (pairs - index) * 3_600_000),
    );
    rows.push({ tenantId, userId, role: AiMessageRole.USER, content: exchange.user, createdAt: when });
    rows.push({
      tenantId,
      userId,
      role: AiMessageRole.ASSISTANT,
      content: exchange.assistant,
      createdAt: new Date(when.getTime() + 4_000),
    });
  });

  await prisma.aiChatMessage.createMany({ data: rows });
}

// ═════════════════════════════════════════════════════════ Avaliações ═══════

/** Avaliações amarradas a atendimentos reais — o "Avaliar" do histórico. */
async function seedRatedReviews(tenantId: string, appointments: GeneratedAppointment[]): Promise<void> {
  const comments = [
    'Atendimento impecável, saí no horário exato.',
    'Degradê perfeito, como sempre.',
    'Barba muito bem feita, recomendo.',
    'Ambiente agradável e profissional atencioso.',
    'Gostei do resultado, volto no mês que vem.',
    'Rápido e caprichado.',
    'Melhor barbearia da região, sem exagero.',
    'Bom atendimento, só demorou um pouco para começar.',
  ];

  const rated = appointments
    .filter((appointment) => appointment.status === AppointmentStatus.DONE && appointment.dayOffset >= -25)
    .slice(0, comments.length);

  await prisma.review.createMany({
    data: rated.map((appointment, index) => ({
      tenantId,
      clientId: appointment.client.id,
      barberId: appointment.barber.id,
      appointmentId: appointment.id,
      authorName: `${appointment.client.name.split(' ')[0]} ${appointment.client.name.split(' ')[1]?.[0] ?? ''}.`.trim(),
      rating: index === comments.length - 1 ? 4 : 5,
      comment: comments[index] as string,
      createdAt: addMinutes(appointment.endsAt, 120),
    })),
  });
}

// ═══════════════════════════════════════════════ Tenant secundário ══════════

/**
 * O tenant secundário com o mínimo em CADA módulo. Ele não é decoração: é a
 * prova visual de isolamento (logar nele e não ver nada da Barbearia Central) e
 * o único lugar onde o limite de barbeiros do plano e a cota do Assistente IA
 * podem ser exercitados — o tenant demo assina o Avançado, ilimitado nos dois.
 */
async function seedSecondaryTenant(): Promise<void> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: ISOLATION_TENANT.slug },
    select: { id: true, planId: true },
  });
  const tenantId = tenant.id;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      status: TenantStatus.ACTIVE,
      email: 'contato@barbeariaisolamento.com.br',
      phone: '551144445555',
      settings: {
        update: {
          onboardingStep: 6,
          onboardingDoneAt: new Date(),
          monthlyGoalCents: 600_000,
          sobre: 'Barbearia de bairro, atendimento de segunda a sábado com hora marcada.',
          address: 'Av. das Palmeiras, 120 — Zona Norte, São Paulo/SP',
        },
      },
      whatsappConfigs: {
        create: WHATSAPP_TEMPLATES.map((template) => ({
          event: template.event as WhatsappEvent,
          enabled: template.enabled,
          // A data de ativação é o que o gráfico de faltas (Relatórios) marca;
          // o lembrete nasce ligado há alguns meses, o resto desde sempre.
          enabledAt: template.enabled ? whatsappEnabledAt(template.event) : null,
          template: template.template,
          offsetMinutes: template.offsetMinutes,
        })),
      },
      bankAccounts: {
        create: {
          name: SECONDARY_TENANT.bankAccount.name,
          type: SECONDARY_TENANT.bankAccount.type,
          balanceCents: SECONDARY_TENANT.bankAccount.balanceCents,
          acceptedMethods: [PaymentMethod.PIX, PaymentMethod.DEBIT],
        },
      },
      loyaltyProgram: { create: { active: false } },
    },
  });

  const owner = await prisma.user.create({
    data: {
      email: SECONDARY_TENANT.ownerEmail,
      name: SECONDARY_TENANT.ownerName,
      passwordHash: await argon(SECONDARY_TENANT.password),
      emailVerifiedAt: new Date(),
      memberships: { create: { tenantId, role: MembershipRole.OWNER } },
    },
    select: { id: true },
  });

  const rule = await prisma.commissionRule.create({
    data: {
      tenantId,
      name: 'Comissão padrão',
      type: CommissionRuleType.FIXED,
      percentBps: 3_500,
      percentProdutosBps: 1_000,
    },
    select: { id: true },
  });

  const services = await Promise.all(
    SECONDARY_TENANT.services.map((service, index) =>
      prisma.service.create({ data: { tenantId, ...service, sortOrder: index }, select: { id: true, name: true, durationMin: true, priceCents: true } }),
    ),
  );

  const barbers = await Promise.all(
    SECONDARY_TENANT.barbers.map((barber, index) =>
      prisma.barber.create({
        data: {
          tenantId,
          name: barber.name,
          specialty: barber.specialty,
          ratingBps: 470 + index * 10,
          commissionRuleId: rule.id,
          sortOrder: index,
          hiredAt: daysFromNow(-200),
          barberServices: { create: services.map((service) => ({ tenantId, serviceId: service.id })) },
          workSchedules: {
            create: BUSINESS_HOURS.map((hour) => ({
              tenantId,
              weekday: hour.weekday,
              startTime: hour.closed ? 9 * 60 : hour.opensAt,
              endTime: hour.closed ? 18 * 60 : hour.closesAt,
              lunchStart: hour.closed ? null : 12 * 60,
              lunchEnd: hour.closed ? null : 13 * 60,
              isDayOff: hour.closed,
            })),
          },
        },
        select: { id: true },
      }),
    ),
  );

  // Feriado da casa inteira (`barberId` nulo) — a aba Equipe do tenant
  // secundário também precisa de exceção de agenda para não abrir vazia.
  await prisma.scheduleException.create({
    data: {
      tenantId,
      startDate: dateOnly(10),
      endDate: dateOnly(10),
      type: ScheduleExceptionType.HOLIDAY,
      reason: 'Feriado municipal',
    },
  });

  const product = await prisma.product.create({
    data: { tenantId, ...SECONDARY_TENANT.product, category: 'Cuidados' },
    select: { id: true, name: true, priceCents: true },
  });

  const clients = await Promise.all(
    SECONDARY_TENANT.clients.map((client, index) =>
      prisma.client.create({
        data: {
          phone: client.phone,
          name: client.name,
          email: client.email,
          birthDate: birthDate(30 + index * 40, index),
          phoneVerifiedAt: new Date(),
          consentAt: new Date(),
          consentVersion: CURRENT_TERMS_VERSION,
          profiles: {
            create: {
              tenantId,
              phone: client.phone,
              favoriteBarberId: barbers[index % barbers.length]!.id,
              firstVisitAt: daysFromNow(-90 + index * 10),
            },
          },
        },
        select: { id: true },
      }),
    ),
  );

  // Agenda mínima: um atendimento por status relevante, sem sobreposição.
  const agenda = [
    { dayOffset: openDay(-6), start: 9 * 60, status: AppointmentStatus.DONE },
    { dayOffset: openDay(-3), start: 10 * 60, status: AppointmentStatus.DONE },
    { dayOffset: openDay(-1), start: 11 * 60, status: AppointmentStatus.NO_SHOW },
    { dayOffset: 0, start: 14 * 60, status: AppointmentStatus.CONFIRMED },
    { dayOffset: openDay(2), start: 15 * 60, status: AppointmentStatus.SCHEDULED },
  ];

  let orderNumber = 1;
  const closedOrders: Array<{ clientId: string; totalCents: number; closedAt: Date }> = [];

  for (const [index, entry] of agenda.entries()) {
    const service = services[index % services.length]!;
    const barber = barbers[index % barbers.length]!;
    const client = clients[index % clients.length]!;
    const startsAt = at(entry.dayOffset, entry.start);

    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        bookingCode: `AG-N${String(index + 1).padStart(4, '0')}`,
        barberId: barber.id,
        serviceId: service.id,
        clientId: client.id,
        startsAt,
        endsAt: addMinutes(startsAt, service.durationMin),
        status: entry.status,
        origin: AppointmentOrigin.PUBLIC,
        priceCents: service.priceCents,
        confirmedAt:
          entry.status === AppointmentStatus.CONFIRMED || entry.status === AppointmentStatus.DONE
            ? addMinutes(startsAt, -120)
            : null,
        services: {
          create: {
            tenantId,
            serviceId: service.id,
            priceCents: service.priceCents,
            durationMin: service.durationMin,
          },
        },
      },
      select: { id: true },
    });

    if (entry.status !== AppointmentStatus.DONE) continue;

    const closedAt = addMinutes(startsAt, service.durationMin + 10);
    const withProduct = index === 0;
    const subtotal = service.priceCents + (withProduct ? product.priceCents : 0);

    const order = await prisma.order.create({
      data: {
        tenantId,
        number: orderNumber++,
        clientId: client.id,
        barberId: barber.id,
        appointmentId: appointment.id,
        status: OrderStatus.CLOSED,
        subtotalCents: subtotal,
        totalCents: subtotal,
        openedAt: startsAt,
        closedAt,
        items: {
          create: [
            {
              tenantId,
              kind: OrderItemKind.SERVICE,
              serviceId: service.id,
              barberId: barber.id,
              description: service.name,
              quantity: 1,
              unitPriceCents: service.priceCents,
              totalCents: service.priceCents,
            },
            ...(withProduct
              ? [
                  {
                    tenantId,
                    kind: OrderItemKind.PRODUCT,
                    productId: product.id,
                    barberId: barber.id,
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
            method: withProduct ? PaymentMethod.PIX : PaymentMethod.CASH,
            status: PaymentStatus.PAID,
            amountCents: subtotal,
            paidAt: closedAt,
          },
        },
      },
      select: { id: true, items: { where: { kind: OrderItemKind.SERVICE }, select: { id: true } } },
    });

    await prisma.commissionEntry.create({
      data: {
        tenantId,
        barberId: barber.id,
        orderId: order.id,
        orderItemId: order.items[0]?.id ?? null,
        referenceMonth: monthStartOf(closedAt),
        baseCents: service.priceCents,
        percentBps: 3_500,
        amountCents: Math.round((service.priceCents * 3_500) / 10_000),
        status: CommissionEntryStatus.PENDING,
        createdAt: closedAt,
      },
    });

    closedOrders.push({ clientId: client.id, totalCents: subtotal, closedAt });
  }

  // Comanda aberta agora.
  const openService = services[0]!;
  await prisma.order.create({
    data: {
      tenantId,
      number: orderNumber++,
      clientId: clients[0]!.id,
      barberId: barbers[0]!.id,
      status: OrderStatus.OPEN,
      subtotalCents: openService.priceCents,
      totalCents: openService.priceCents,
      openedAt: addMinutes(new Date(), -30),
      items: {
        create: {
          tenantId,
          kind: OrderItemKind.SERVICE,
          serviceId: openService.id,
          barberId: barbers[0]!.id,
          description: openService.name,
          quantity: 1,
          unitPriceCents: openService.priceCents,
          totalCents: openService.priceCents,
        },
      },
    },
  });

  // Perfis coerentes com as comandas fechadas.
  for (const client of clients) {
    const own = closedOrders.filter((order) => order.clientId === client.id);
    if (own.length === 0) continue;
    await prisma.clientProfile.updateMany({
      where: { tenantId, clientId: client.id },
      data: {
        visitCount: own.length,
        totalSpentCents: own.reduce((sum, order) => sum + order.totalCents, 0),
        lastVisitAt: own[own.length - 1]!.closedAt,
      },
    });
  }

  const bankAccount = await prisma.bankAccount.findFirstOrThrow({ where: { tenantId }, select: { id: true } });

  await prisma.accountPayable.create({
    data: {
      tenantId,
      description: SECONDARY_TENANT.payable.description,
      category: SECONDARY_TENANT.payable.category,
      supplier: SECONDARY_TENANT.payable.supplier,
      amountCents: SECONDARY_TENANT.payable.amountCents,
      dueDate: dateOnly(SECONDARY_TENANT.payable.dueInDays),
      status: AccountStatus.PENDING,
      bankAccountId: bankAccount.id,
    },
  });

  await prisma.accountReceivable.create({
    data: {
      tenantId,
      description: SECONDARY_TENANT.receivable.description,
      category: SECONDARY_TENANT.receivable.category,
      customer: SECONDARY_TENANT.receivable.customer,
      amountCents: SECONDARY_TENANT.receivable.amountCents,
      dueDate: dateOnly(SECONDARY_TENANT.receivable.dueInDays),
      status: AccountStatus.PENDING,
      bankAccountId: bankAccount.id,
    },
  });

  await prisma.vale.create({
    data: {
      tenantId,
      barberId: barbers[0]!.id,
      amountCents: 10_000,
      date: dateOnly(-4),
      referenceMonth: currentMonthStart(),
      description: 'Adiantamento',
    },
  });

  // Caixa de ontem fechado — mesmo estado do tenant demo.
  const yesterdayOffset = openDay(-1);
  const register = await prisma.cashRegister.create({
    data: {
      tenantId,
      openedByUserId: owner.id,
      status: CashRegisterStatus.CLOSED,
      openingCents: 10_000,
      expectedCents: 10_000,
      countedCents: 10_000,
      differenceCents: 0,
      openedAt: at(yesterdayOffset, 9 * 60),
      closedAt: at(yesterdayOffset, 18 * 60),
    },
    select: { id: true },
  });
  await prisma.cashMovement.createMany({
    data: [
      {
        tenantId,
        cashRegisterId: register.id,
        type: CashMovementType.OPENING,
        amountCents: 10_000,
        description: 'Abertura do caixa',
        method: PaymentMethod.CASH,
        category: 'Abertura',
        createdByUserId: owner.id,
        createdAt: at(yesterdayOffset, 9 * 60),
      },
      {
        tenantId,
        cashRegisterId: register.id,
        type: CashMovementType.CLOSING,
        amountCents: 0,
        description: 'Fechamento — conferido 100.00',
        category: 'Fechamento',
        createdByUserId: owner.id,
        createdAt: at(yesterdayOffset, 18 * 60),
      },
    ],
  });

  // Assinatura: 1 plano, 1 assinante com uso parcial.
  const plan = await prisma.clientPlan.create({
    data: {
      tenantId,
      name: SECONDARY_TENANT.plan.name,
      description: SECONDARY_TENANT.plan.description,
      priceCents: SECONDARY_TENANT.plan.priceCents,
      billingDay: CLIENT_PLAN_BILLING_DAY,
      items: { create: { tenantId, serviceId: services[0]!.id, quota: 2 } },
    },
    select: { id: true },
  });

  const periodStart = currentMonthStart();
  await prisma.clientSubscription.create({
    data: {
      tenantId,
      clientId: clients[0]!.id,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1)),
      nextChargeAt: new Date(
        Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, CLIENT_PLAN_BILLING_DAY),
      ),
      usages: {
        create: {
          tenantId,
          serviceId: services[0]!.id,
          periodStart,
          periodEnd: new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1)),
          quota: 2,
          used: 1,
        },
      },
    },
  });

  await prisma.review.createMany({
    data: [
      {
        tenantId,
        barberId: barbers[0]!.id,
        authorName: 'Norberto A.',
        rating: 5,
        comment: 'Atendimento pontual e caprichado.',
        createdAt: daysFromNow(-6),
      },
      {
        tenantId,
        barberId: barbers[1]!.id,
        authorName: 'Osvaldo P.',
        rating: 4,
        comment: 'Bom corte, ambiente simples.',
        createdAt: daysFromNow(-20),
      },
    ],
  });

  await prisma.notificationOutbox.createMany({
    data: [
      {
        tenantId,
        channel: NotificationChannel.WHATSAPP,
        recipient: SECONDARY_TENANT.clients[0].phone,
        templateKey: WhatsappEvent.CONFIRMATION,
        body: 'Seu horário está confirmado.',
        status: OutboxStatus.SENT,
        sentAt: daysFromNow(-1),
      },
      {
        tenantId,
        channel: NotificationChannel.WHATSAPP,
        recipient: SECONDARY_TENANT.clients[1].phone,
        templateKey: WhatsappEvent.REMINDER,
        body: 'Lembrete do seu horário de amanhã.',
        status: OutboxStatus.PENDING,
        scheduledFor: daysFromNow(1),
      },
    ],
  });

  await seedAssistant(tenantId, owner.id, SECONDARY_TENANT.aiMessages);

  await prisma.auditLog.createMany({
    data: [
      {
        tenantId,
        actorUserId: owner.id,
        action: 'auth.login',
        entity: 'User',
        metadata: { seed: 'demo' },
        createdAt: daysFromNow(0),
      },
      {
        tenantId,
        actorUserId: owner.id,
        action: 'tenant.settings_updated',
        entity: 'TenantSettings',
        metadata: { seed: 'demo' },
        createdAt: daysFromNow(-4),
      },
    ],
  });
}

// ═════════════════════════════════════════════════════════════════ Main ═════

async function main(): Promise<void> {
  console.info('› seed base…\n');
  await seedBase();

  console.info('\n› seed demo — limpando sobras…');
  await resetDemoExtras();

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: DEMO_TENANT.slug },
    select: { id: true },
  });
  const tenantId = tenant.id;

  const owner = await prisma.user.findUniqueOrThrow({ where: { email: USERS.owner.email }, select: { id: true } });
  const manager = await prisma.user.findUniqueOrThrow({ where: { email: USERS.manager.email }, select: { id: true } });

  console.info('› equipe (5 barbeiros), escalas e catálogo…');
  const { barbers, services } = await seedTeamAndCatalog(tenantId);
  const inviteToken = await seedStaffInvite(tenantId, owner.id, services);

  console.info('› 40 clientes (12 inativos · 3 aniversariantes · 2 faltosos)…');
  const clients = await seedDemoClients(tenantId, barbers);

  console.info('› agenda (8 meses de histórico + 30 dias densos + 7 à frente)…');
  const occupancy = await loadOccupancy(tenantId, barbers);
  const { appointments } = generateAgenda(barbers, services, clients, occupancy);
  await persistAgenda(tenantId, appointments);

  console.info('› comandas, itens e pagamentos…');
  const orders = await seedOrders(tenantId, appointments, clients, barbers, services);

  console.info('› comissões (mesma regra de faixa do serviço)…');
  await seedCommissions(tenantId, orders, barbers);

  console.info('› assinaturas com uso parcial e 1 cobrança recusada…');
  const covered = await seedSubscriptions(tenantId, clients, orders);

  console.info('› perfis, estoque, caixa e financeiro…');
  await syncClientProfiles(tenantId, clients, orders, appointments);
  const soldUnits = await syncStock(tenantId, orders);
  await seedCashRegister(tenantId, manager.id, orders);
  await seedFinanceExtras(tenantId);
  await seedPriceCalculator(tenantId);

  console.info('› outbox, auditoria, avaliações e Assistente IA…');
  const outbox = await seedOutbox(tenantId, appointments);
  await seedRatedReviews(tenantId, appointments);
  await seedAuditLog(tenantId, { owner: owner.id, manager: manager.id });
  await seedAssistant(tenantId, owner.id, DEMO_AI_CONVERSATION.length);

  console.info(`› tenant secundário (${ISOLATION_TENANT.slug}) — mínimo em cada módulo…`);
  await seedSecondaryTenant();

  await report({ tenantId, inviteToken, covered, outbox, soldUnits });
}

async function report(context: { tenantId: string; inviteToken: string; covered: number; outbox: number; soldUnits: number }): Promise<void> {
  const { tenantId } = context;
  const monthStart = currentMonthStart();

  const [barbers, clients, appointments, closedOrders, openOrders, revenue, commissions, inactive, lowStock, payables] =
    await Promise.all([
      prisma.barber.count({ where: { tenantId, deletedAt: null } }),
      prisma.clientProfile.count({ where: { tenantId, deletedAt: null } }),
      prisma.appointment.count({ where: { tenantId } }),
      prisma.order.count({ where: { tenantId, status: OrderStatus.CLOSED, closedAt: { gte: monthStart } } }),
      prisma.order.count({ where: { tenantId, status: OrderStatus.OPEN } }),
      prisma.order.aggregate({
        where: { tenantId, status: OrderStatus.CLOSED, closedAt: { gte: monthStart } },
        _sum: { totalCents: true },
      }),
      prisma.commissionEntry.aggregate({
        where: { tenantId, referenceMonth: monthStart },
        _sum: { amountCents: true },
      }),
      prisma.clientProfile.count({
        where: { tenantId, deletedAt: null, lastVisitAt: { not: null, lt: daysFromNow(-30) } },
      }),
      prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*)::bigint AS "total" FROM "Product"
        WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL AND active = true AND stock <= "estoqueMin"
      `,
      prisma.accountPayable.count({
        where: { tenantId, status: AccountStatus.PENDING, dueDate: { gte: dateOnly(0), lte: dateOnly(6) } },
      }),
    ]);

  const brl = (cents: number): string =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  console.info('\n✓ seed demo concluído');
  console.info(`  barbeiros: ${barbers} · clientes: ${clients} · agendamentos: ${appointments}`);
  console.info(`  comandas no mês: ${closedOrders} fechadas (${context.covered} cobertas por assinatura) · ${openOrders} abertas`);
  console.info(`  faturamento do mês: ${brl(revenue._sum.totalCents ?? 0)} · comissões: ${brl(commissions._sum.amountCents ?? 0)}`);
  console.info(`  alertas da home → inativos: ${inactive} · estoque baixo: ${Number(lowStock[0]?.total ?? 0)} · contas na semana: ${payables} · caixa aberto hoje: não`);
  console.info(`  produtos vendidos nas comandas: ${context.soldUnits} un. · outbox do WhatsApp: ${context.outbox} mensagens`);
  console.info(`\n  login demo:      ${USERS.owner.email} / ${USERS.owner.password}`);
  console.info(`  login secundário: ${SECONDARY_TENANT.ownerEmail} / ${SECONDARY_TENANT.password}`);
  console.info(`  convite pendente: /app/aceitar-convite?token=${context.inviteToken}`);
  console.info('  (dados de desenvolvimento — este seed nunca roda em produção)\n');
}

main()
  .catch((error) => {
    console.error('✗ seed demo falhou:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/** Ver `WHATSAPP_REMINDER_ENABLED_MONTHS_AGO` — o marcador do gráfico de faltas. */
function whatsappEnabledAt(event: string): Date {
  const at = new Date();
  if (event === 'REMINDER') {
    at.setMonth(at.getMonth() - WHATSAPP_REMINDER_ENABLED_MONTHS_AGO);
  } else {
    at.setMonth(at.getMonth() - 8);
  }
  return at;
}
