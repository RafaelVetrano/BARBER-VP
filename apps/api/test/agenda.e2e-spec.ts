import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { AppointmentStatus, MembershipRole, PrismaClient } from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Agente 15 — a aba Agenda de ponta a ponta.
 *
 * O que estes casos protegem, e por que:
 *
 * 1. **A grade vem do dado, não de um número cravado.** O protótipo desenhava
 *    08:00–20:00 fixo; aqui `gridStartMinutes`/`gridEndMinutes` e a faixa de
 *    almoço têm de sair da escala real do barbeiro.
 * 2. **Bloqueio é um só conceito.** "Bloquear horário" fecha a agenda interna
 *    E a grade pública — se divergirem, o balcão bloqueia o almoço e o site
 *    continua vendendo aquele horário.
 * 3. **Falta conta e bloqueia.** É o contador que acende o ⚠ da grade e
 *    dispara o bloqueio automático de `bloquearFaltasQtd`.
 * 4. **Os horários oferecidos são os aceitos.** O chip clicável de
 *    `/slots` e a validação do `POST` saem do mesmo motor.
 */
describe('aba Agenda (agente 15, e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-ag15-${run}`;
  const password = 'AgendaQuinzeSenha1!';

  let tenantId: string;
  let ownerToken: string;
  let barberId: string;
  let serviceId: string;
  let clientId: string;
  let unitId: string;

  /** Escala do barbeiro: 09:00–18:00 com almoço 12:00–13:00, todo dia. */
  const WORK_START = 540;
  const WORK_END = 1_080;
  const LUNCH_START = 720;
  const LUNCH_END = 780;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const asOwner = () => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    delete: (path: string) => api().delete(url(path)).set('Authorization', `Bearer ${ownerToken}`),
  });

  /** Um dia útil à frente, para nunca esbarrar em "já passou". */
  const targetDate = (): string => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const plan = await prisma.saasPlan.create({
      data: {
        code: `e2e-ag15-${run}`,
        name: 'Avançado (e2e ag15)',
        priceCents: 13_900,
        tier: PlanTier.AVANCADO,
        maxBarbers: null,
        features: featuresForTier(PlanTier.AVANCADO) as unknown as object,
      },
      select: { id: true },
    });

    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: 'Barbearia AG15 (e2e)',
        planId: plan.id,
        // Casa aberta das 08:00 às 20:00 — mais larga que a escala do
        // barbeiro de propósito: a grade tem de seguir a ESCALA, não a casa.
        businessHours: {
          create: Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            opensAt: 480,
            closesAt: 1_200,
            closed: false,
          })),
        },
        settings: { create: { slotIntervalMin: 30, bloquearFaltasAtivo: true, bloquearFaltasQtd: 2 } },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-ag15-owner-${run}@barbervp.test`;
    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dono AG15',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });

    const unit = await prisma.unit.create({
      data: { tenantId, name: 'Unidade AG15', isDefault: true },
      select: { id: true },
    });
    unitId = unit.id;

    const barber = await prisma.barber.create({
      data: {
        tenantId,
        name: 'Barbeiro AG15',
        unitId,
        workSchedules: {
          create: Array.from({ length: 7 }, (_, weekday) => ({
            tenantId,
            weekday,
            startTime: WORK_START,
            endTime: WORK_END,
            lunchStart: LUNCH_START,
            lunchEnd: LUNCH_END,
            isDayOff: false,
          })),
        },
      },
      select: { id: true },
    });
    barberId = barber.id;

    const service = await prisma.service.create({
      data: {
        tenantId,
        name: 'Corte AG15',
        durationMin: 30,
        priceCents: 5_000,
        barberServices: { create: { tenantId, barberId } },
      },
      select: { id: true },
    });
    serviceId = service.id;

    const client = await prisma.client.create({
      data: {
        phone: `9915${run}`,
        name: 'Cliente AG15',
        profiles: { create: { tenantId, phone: `9915${run}` } },
      },
      select: { id: true },
    });
    clientId = client.id;

    const login = await api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.saasPlan.deleteMany({ where: { code: `e2e-ag15-${run}` } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── A grade sai do dado ──────────────────────────────────────────────────

  it('a grade do dia usa a ESCALA do barbeiro, e não o horário da casa nem um valor fixo', async () => {
    const response = await asOwner()
      .get(`/staff-agenda?date=${targetDate()}&view=DAY`)
      .expect(200);

    // A casa abre 08:00–20:00; o barbeiro trabalha 09:00–18:00. Vale a escala.
    expect(response.body.gridStartMinutes).toBe(WORK_START);
    expect(response.body.gridEndMinutes).toBe(WORK_END);
    expect(response.body.slotIntervalMinutes).toBe(30);

    const column = response.body.days[0].barbers[0];
    expect(column.workStartMinutes).toBe(WORK_START);
    expect(column.workEndMinutes).toBe(WORK_END);
    expect(column.lunchStartMinutes).toBe(LUNCH_START);
    expect(column.lunchEndMinutes).toBe(LUNCH_END);
  });

  it('as 4 visões respondem, e a de mês devolve uma célula por dia', async () => {
    const date = targetDate();

    for (const view of ['DAY', 'WEEK', 'TIMELINE']) {
      const response = await asOwner().get(`/staff-agenda?date=${date}&view=${view}`).expect(200);
      expect(response.body.days.length).toBe(view === 'WEEK' ? 7 : 1);
    }

    const month = await asOwner().get(`/staff-agenda/month?date=${date}`).expect(200);
    const daysInMonth = new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)),
      0,
    ).getDate();
    expect(month.body.cells.length).toBe(daysInMonth);
    expect(month.body.leadingBlanks).toBeGreaterThanOrEqual(0);
    expect(month.body.leadingBlanks).toBeLessThanOrEqual(6);
  });

  // ── Horários oferecidos = horários aceitos ───────────────────────────────

  it('o almoço não aparece como horário livre, e o horário livre oferecido é aceito no POST', async () => {
    const date = targetDate();

    const slots = await asOwner()
      .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
      .expect(200);

    const lunchSlot = slots.body.slots.find((slot: { time: string }) => slot.time === '12:00');
    expect(lunchSlot).toBeDefined();
    expect(lunchSlot.available).toBe(false);

    const free = slots.body.slots.find((slot: { available: boolean }) => slot.available);
    expect(free).toBeDefined();

    const created = await asOwner()
      .post('/staff-agenda')
      .send({
        barberId,
        serviceIds: [serviceId],
        startsAt: free.startsAt,
        clientId,
        notifyWhatsapp: false,
      })
      .expect(201);

    expect(created.body.durationMin).toBe(30);
    expect(created.body.clientNoShowCount).toBe(0);

    // O mesmo horário deixa de ser oferecido depois de ocupado.
    const after = await asOwner()
      .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
      .expect(200);
    const taken = after.body.slots.find((slot: { time: string }) => slot.time === free.time);
    expect(taken.available).toBe(false);

    // E um segundo POST no mesmo horário é 409, não um agendamento duplo.
    const conflict = await asOwner()
      .post('/staff-agenda')
      .send({ barberId, serviceIds: [serviceId], startsAt: free.startsAt, clientId, notifyWhatsapp: false })
      .expect(409);
    expect(conflict.body.code).toBe('DOUBLE_BOOKING');

    await prisma.appointment.delete({ where: { id: created.body.id } });
  });

  // ── Bloqueio ─────────────────────────────────────────────────────────────

  it('bloquear uma faixa some com ela na agenda interna E na grade pública', async () => {
    const date = targetDate();

    const before = await asOwner()
      .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
      .expect(200);
    const target = before.body.slots.find(
      (slot: { time: string; available: boolean }) => slot.time === '15:00' && slot.available,
    );
    expect(target).toBeDefined();

    const block = await asOwner()
      .post('/staff-agenda/blocks')
      .send({
        barberId,
        startDate: date,
        endDate: date,
        startTime: '15:00',
        endTime: '16:00',
        reason: 'Manutenção',
      })
      .expect(201);

    // Agenda interna: a faixa vira um bloco desenhado na coluna.
    const agenda = await asOwner().get(`/staff-agenda?date=${date}&view=DAY`).expect(200);
    const column = agenda.body.days[0].barbers[0];
    expect(column.blocks).toHaveLength(1);
    expect(column.blocks[0].startMinutes).toBe(900);
    expect(column.blocks[0].endMinutes).toBe(960);
    expect(column.blocks[0].reason).toBe('Manutenção');

    // Grade interna de horários: 15:00 e 15:30 saíram.
    const blocked = await asOwner()
      .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
      .expect(200);
    for (const time of ['15:00', '15:30']) {
      const slot = blocked.body.slots.find((row: { time: string }) => row.time === time);
      expect(slot.available).toBe(false);
    }

    // Canal PÚBLICO: o mesmo bloqueio fecha o horário para o cliente.
    const publicGrid = await api()
      .get(url(`/public/${slug}/availability?serviceIds=${serviceId}&barberId=${barberId}&date=${date}`))
      .expect(200);
    const publicTimes = publicGrid.body.slots.map((slot: { time: string }) => slot.time);
    expect(publicTimes).not.toContain('15:00');
    expect(publicTimes).not.toContain('15:30');

    // Removido o bloqueio, o horário volta para as duas grades.
    await asOwner().delete(`/staff-agenda/blocks/${block.body.id}`).expect(204);

    const restored = await asOwner()
      .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
      .expect(200);
    expect(
      restored.body.slots.find((row: { time: string }) => row.time === '15:00').available,
    ).toBe(true);
  });

  it('bloqueio sem horas fecha o dia inteiro', async () => {
    const date = targetDate();

    const block = await asOwner()
      .post('/staff-agenda/blocks')
      .send({ barberId, startDate: date, endDate: date, reason: 'Férias' })
      .expect(201);

    const agenda = await asOwner().get(`/staff-agenda?date=${date}&view=DAY`).expect(200);
    expect(agenda.body.days[0].barbers[0].workStartMinutes).toBeNull();

    const slots = await asOwner()
      .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
      .expect(200);
    expect(slots.body.slots).toHaveLength(0);

    await asOwner().delete(`/staff-agenda/blocks/${block.body.id}`).expect(204);
  });

  it('bloqueio com hora de fim antes da de início é recusado (400)', async () => {
    const date = targetDate();
    await asOwner()
      .post('/staff-agenda/blocks')
      .send({ barberId, startDate: date, endDate: date, startTime: '16:00', endTime: '15:00', reason: 'Pessoal' })
      .expect(400);

    // Uma hora só, sem a outra, também não passa.
    await asOwner()
      .post('/staff-agenda/blocks')
      .send({ barberId, startDate: date, endDate: date, startTime: '16:00', reason: 'Pessoal' })
      .expect(400);
  });

  // ── Falta ────────────────────────────────────────────────────────────────

  it('marcar falta conta na ficha do cliente e bloqueia ao atingir o limite do tenant', async () => {
    const date = targetDate();

    const makeAppointment = async (time: string): Promise<string> => {
      const slots = await asOwner()
        .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
        .expect(200);
      const slot = slots.body.slots.find(
        (row: { time: string; available: boolean }) => row.time === time && row.available,
      );
      expect(slot).toBeDefined();

      const created = await asOwner()
        .post('/staff-agenda')
        .send({ barberId, serviceIds: [serviceId], startsAt: slot.startsAt, clientId, notifyWhatsapp: false })
        .expect(201);
      return created.body.id;
    };

    const first = await makeAppointment('09:00');
    const second = await makeAppointment('09:30');

    const afterFirst = await asOwner().patch(`/staff-agenda/${first}/no-show`).send({}).expect(200);
    expect(afterFirst.body.status).toBe(AppointmentStatus.NO_SHOW);
    expect(afterFirst.body.clientNoShowCount).toBe(1);

    let profile = await prisma.clientProfile.findFirstOrThrow({
      where: { tenantId, clientId },
      select: { noShowCount: true, blocked: true },
    });
    expect(profile.noShowCount).toBe(1);
    expect(profile.blocked).toBe(false);

    // `bloquearFaltasQtd` é 2 neste tenant: a segunda falta bloqueia.
    const afterSecond = await asOwner().patch(`/staff-agenda/${second}/no-show`).send({}).expect(200);
    expect(afterSecond.body.clientNoShowCount).toBe(2);

    profile = await prisma.clientProfile.findFirstOrThrow({
      where: { tenantId, clientId },
      select: { noShowCount: true, blocked: true },
    });
    expect(profile.noShowCount).toBe(2);
    expect(profile.blocked).toBe(true);

    // Uma falta já lançada não é lançada de novo.
    await asOwner().patch(`/staff-agenda/${first}/no-show`).send({}).expect(409);

    // E o ⚠ do protótipo agora acende: a grade traz o contador no item.
    const agenda = await asOwner().get(`/staff-agenda?date=${date}&view=DAY`).expect(200);
    const items = agenda.body.days[0].barbers[0].appointments;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.clientNoShowCount).toBe(2);
    }

    await prisma.appointment.deleteMany({ where: { id: { in: [first, second] } } });
    await prisma.clientProfile.updateMany({
      where: { tenantId, clientId },
      data: { noShowCount: 0, blocked: false },
    });
  });

  // ── Drawer ───────────────────────────────────────────────────────────────

  it('o detalhe do drawer traz o agendamento e as últimas visitas do cliente', async () => {
    const date = targetDate();

    // Uma visita concluída no passado — é o que "Últimas visitas" lista.
    const past = new Date();
    past.setDate(past.getDate() - 10);
    past.setHours(10, 0, 0, 0);
    const done = await prisma.appointment.create({
      data: {
        tenantId,
        bookingCode: `AG15${run}A`,
        barberId,
        serviceId,
        clientId,
        startsAt: past,
        endsAt: new Date(past.getTime() + 30 * 60_000),
        status: AppointmentStatus.DONE,
        priceCents: 5_000,
        services: {
          create: { tenantId, serviceId, sortOrder: 0, priceCents: 5_000, durationMin: 30 },
        },
      },
      select: { id: true },
    });

    const slots = await asOwner()
      .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
      .expect(200);
    const free = slots.body.slots.find((slot: { available: boolean }) => slot.available);

    const created = await asOwner()
      .post('/staff-agenda')
      .send({ barberId, serviceIds: [serviceId], startsAt: free.startsAt, clientId, notifyWhatsapp: false })
      .expect(201);

    const detail = await asOwner().get(`/staff-agenda/${created.body.id}`).expect(200);
    expect(detail.body.appointment.id).toBe(created.body.id);
    expect(detail.body.history).toHaveLength(1);
    expect(detail.body.history[0].serviceName).toBe('Corte AG15');
    expect(detail.body.history[0].totalPriceCents).toBe(5_000);

    await prisma.appointment.deleteMany({ where: { id: { in: [created.body.id, done.id] } } });
  });

  // ── Remarcar ─────────────────────────────────────────────────────────────

  it('o agendamento nasce com a UNIDADE do barbeiro — sem isso o filtro por unidade dos Relatórios devolve zero', async () => {
    const date = targetDate();
    const slots = await asOwner()
      .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
      .expect(200);
    const free = slots.body.slots.find((slot: { available: boolean }) => slot.available);
    expect(free).toBeDefined();

    const created = await asOwner()
      .post('/staff-agenda')
      .send({ barberId, serviceIds: [serviceId], startsAt: free.startsAt, clientId })
      .expect(201);

    const row = await prisma.appointment.findUnique({
      where: { id: created.body.id },
      select: { unitId: true },
    });
    expect(row?.unitId).toBe(unitId);

    await asOwner().patch(`/staff-agenda/${created.body.id}/cancel`).send({}).expect(200);
  });

  it('remarcar passa pelo motor de disponibilidade — horário ocupado responde 409', async () => {
    const date = targetDate();

    const slots = await asOwner()
      .get(`/staff-agenda/slots?date=${date}&barberId=${barberId}&serviceIds=${serviceId}`)
      .expect(200);
    const [first, second] = slots.body.slots.filter((slot: { available: boolean }) => slot.available);

    const a = await asOwner()
      .post('/staff-agenda')
      .send({ barberId, serviceIds: [serviceId], startsAt: first.startsAt, clientId, notifyWhatsapp: false })
      .expect(201);
    const b = await asOwner()
      .post('/staff-agenda')
      .send({ barberId, serviceIds: [serviceId], startsAt: second.startsAt, clientId, notifyWhatsapp: false })
      .expect(201);

    // Mover `b` para cima de `a` colide.
    const conflict = await asOwner()
      .patch(`/staff-agenda/${b.body.id}/move`)
      .send({ startsAt: first.startsAt })
      .expect(409);
    expect(conflict.body.code).toBe('DOUBLE_BOOKING');

    // Já para um horário livre, passa.
    const third = slots.body.slots.filter((slot: { available: boolean }) => slot.available)[2];
    const moved = await asOwner()
      .patch(`/staff-agenda/${b.body.id}/move`)
      .send({ startsAt: third.startsAt })
      .expect(200);
    expect(moved.body.startsAt).toBe(third.startsAt);

    await prisma.appointment.deleteMany({ where: { id: { in: [a.body.id, b.body.id] } } });
  });
});
