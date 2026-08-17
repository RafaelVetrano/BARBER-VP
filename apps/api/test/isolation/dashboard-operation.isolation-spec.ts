import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { MembershipRole, TokenAudience as PrismaTokenAudience } from '@prisma/client';
import { Role, TokenAudience } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CONFIG, type AppConfig } from '../../src/config/configuration';
import { AccessTokenService } from '../../src/auth/tokens/access-token.service';
import { SessionService } from '../../src/auth/tokens/session.service';
import {
  disconnectIsolationFixture,
  setupIsolationFixture,
  FIXTURE_PASSWORD,
  type IsolationFixture,
} from './tenant-fixture';

/**
 * Isolamento de tenant + papel na operação diária (fase 06).
 *
 * Dois ângulos, os dois exigidos pelo enunciado da fase:
 *   1. Tenant — Clientes/Serviços/Produtos/Equipe/Agenda de A nunca vazam
 *      numa consulta escopada em B.
 *   2. Papel — `BARBER` só enxerga/mexe na própria agenda; `Clientes`,
 *      `Serviços & Produtos` e `Equipe` são OWNER/MANAGER only.
 */
describe('isolamento de tenant e papel — dashboard de operação (fase 06)', () => {
  let fixture: IsolationFixture;
  let app: INestApplication;
  let prefix: string;
  let tokenA: string;
  let tokenB: string;
  let barberTokenSelf: string;
  let barberUserSelfId: string;
  let barberSelfId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  const authed = (token: () => string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token()}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token()}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${token()}`),
  });
  const asA = authed(() => tokenA);
  const asB = authed(() => tokenB);
  const asBarber = authed(() => barberTokenSelf);

  const login = async (email: string): Promise<string> => {
    const response = await api().post(url('/auth/login')).send({ email, password: FIXTURE_PASSWORD }).expect(200);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    fixture = await setupIsolationFixture();

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    tokenA = await login(fixture.a.ownerEmail);
    tokenB = await login(fixture.b.ownerEmail);

    // Um segundo barbeiro em A, COM login (o papel BARBER de verdade), aberto
    // o dia inteiro — só para o teste de criação ter um horário sempre válido,
    // sem entrar no mérito de fuso/expediente (isso já é coberto pela fase 04).
    const prisma = fixture.prisma;
    const barberUser = await prisma.user.create({
      data: {
        email: `iso-barber-${Date.now()}@barbervp.test`,
        name: 'Barbeiro Logado A',
        passwordHash: 'unused',
        memberships: { create: { tenantId: fixture.a.id, role: MembershipRole.BARBER } },
      },
      select: { id: true },
    });
    barberUserSelfId = barberUser.id;

    const barberSelf = await prisma.barber.create({
      data: { tenantId: fixture.a.id, userId: barberUser.id, name: 'Barbeiro Logado A' },
      select: { id: true },
    });
    barberSelfId = barberSelf.id;

    await prisma.barberService.create({
      data: { tenantId: fixture.a.id, barberId: barberSelf.id, serviceId: fixture.a.serviceId },
    });
    await prisma.tenantBusinessHour.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        tenantId: fixture.a.id,
        weekday,
        opensAt: 0,
        closesAt: 1439,
        closed: false,
      })),
    });
    await prisma.workSchedule.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        tenantId: fixture.a.id,
        barberId: barberSelf.id,
        weekday,
        startTime: 0,
        endTime: 1439,
        isDayOff: false,
      })),
    });

    const sessions = app.get(SessionService);
    const accessTokens = app.get(AccessTokenService);
    const issued = await sessions.issue({ audience: PrismaTokenAudience.ESTABLISHMENT, userId: barberUser.id, tenantId: fixture.a.id });
    barberTokenSelf = accessTokens.sign({
      subjectId: barberUser.id,
      audience: TokenAudience.ESTABLISHMENT,
      tenantId: fixture.a.id,
      roles: [Role.BARBER],
      isSuperAdmin: false,
      sessionId: issued.session.id,
    });
  });

  afterAll(async () => {
    await app.close();
    await fixture.prisma.user.deleteMany({ where: { id: barberUserSelfId } });
    await fixture.teardown();
    await disconnectIsolationFixture();
  });

  // ── Tenant ───────────────────────────────────────────────────────────────

  it('a lista de clientes de A não traz o cliente de B', async () => {
    const response = await asA.get('/clients').expect(200);
    const ids = response.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(fixture.a.clientProfileId);
    expect(ids).not.toContain(fixture.b.clientProfileId);
  });

  it('a lista de serviços de A não traz o serviço de B, mesmo pedindo perPage alto', async () => {
    const response = await asA.get('/services?perPage=100').expect(200);
    const ids = response.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(fixture.a.serviceId);
    expect(ids).not.toContain(fixture.b.serviceId);
  });

  it('criar serviço com barbeiro de OUTRO tenant é recusado (400), não vira BarberService cross-tenant', async () => {
    const response = await asA
      .post('/services')
      .send({
        name: `Serviço cross-tenant ${Date.now()}`,
        durationMin: 30,
        priceCents: 4_000,
        barberIds: [fixture.b.barberId],
      })
      .expect(400);

    expect(response.body.code).toBe('BAD_REQUEST');
  });

  it('a lista de barbeiros de A não traz o barbeiro de B', async () => {
    const response = await asA.get('/barbers').expect(200);
    const ids = response.body.map((row: { id: string }) => row.id);
    expect(ids).toContain(fixture.a.barberId);
    expect(ids).not.toContain(fixture.b.barberId);
  });

  it('mover/cancelar um agendamento de B usando o token de A responde 404 (não 200 nem 500)', async () => {
    await asA
      .patch(`/staff-agenda/${fixture.b.appointmentId}/cancel`)
      .send({ reason: 'tentativa cross-tenant' })
      .expect(404);
  });

  it('convite criado por A não aparece na lista de B, e B não consegue revogá-lo', async () => {
    const created = await asA
      .post('/team/invites')
      .send({
        name: 'Convidado de A',
        email: `convite-a-${Date.now()}@barbervp.test`,
        serviceIds: [fixture.a.serviceId],
        workDays: [1, 2, 3],
      })
      .expect(201);

    const listB = await asB.get('/team/invites').expect(200);
    expect(listB.body.map((row: { id: string }) => row.id)).not.toContain(created.body.id);

    await asB.post(`/team/invites/${created.body.id}/revoke`).expect(404);
  });

  // ── Papel BARBER ─────────────────────────────────────────────────────────

  it('BARBER não acessa Clientes, Serviços/Produtos nem Equipe (403)', async () => {
    await asBarber.get('/clients').expect(403);
    await asBarber.get('/services').expect(403);
    await asBarber.get('/products').expect(403);
    await asBarber.get('/barbers').expect(403);
    await asBarber.get('/team/invites').expect(403);
  });

  it('a agenda pedida pelo BARBER só mostra a própria coluna, mesmo pedindo barberId de outro', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const response = await asBarber
      .get(`/staff-agenda?date=${today}&view=DAY&barberId=${fixture.a.barberId}`)
      .expect(200);

    const barberIdsShown = response.body.barberOptions.map((row: { id: string }) => row.id);
    expect(barberIdsShown).toEqual([barberSelfId]);
    expect(barberIdsShown).not.toContain(fixture.a.barberId);

    const columnBarberIds = response.body.days[0].barbers.map((col: { barberId: string }) => col.barberId);
    expect(columnBarberIds).toEqual([barberSelfId]);
  });

  it('BARBER criando um agendamento na PRÓPRIA agenda funciona', async () => {
    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    startsAt.setUTCHours(14, 0, 0, 0);

    const response = await asBarber
      .post('/staff-agenda')
      .send({
        barberId: barberSelfId,
        serviceIds: [fixture.a.serviceId],
        startsAt: startsAt.toISOString(),
        walkIn: { name: 'Cliente Avulso', phone: '5511999990000' },
      })
      .expect(201);

    expect(response.body.barberId).toBe(barberSelfId);
    expect(response.body.isWalkIn).toBe(true);
  });

  it('BARBER tentando criar agendamento na agenda de OUTRO barbeiro responde 403', async () => {
    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    startsAt.setUTCHours(15, 0, 0, 0);

    const response = await asBarber
      .post('/staff-agenda')
      .send({
        barberId: fixture.a.barberId,
        serviceIds: [fixture.a.serviceId],
        startsAt: startsAt.toISOString(),
        walkIn: { name: 'Cliente Avulso', phone: '5511999990001' },
      })
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('BARBER tentando mover/cancelar agendamento de OUTRO barbeiro responde 403', async () => {
    await asBarber
      .patch(`/staff-agenda/${fixture.a.appointmentId}/cancel`)
      .send({ reason: 'não deveria conseguir' })
      .expect(403);
  });
});
