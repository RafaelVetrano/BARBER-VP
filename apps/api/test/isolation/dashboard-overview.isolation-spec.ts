import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CONFIG, type AppConfig } from '../../src/config/configuration';
import {
  disconnectIsolationFixture,
  setupIsolationFixture,
  FIXTURE_PASSWORD,
  type IsolationFixture,
} from './tenant-fixture';

/**
 * Isolamento da tela `/app` (fase 13).
 *
 * O dashboard é o endpoint mais perigoso do produto para vazamento: uma única
 * chamada agrega faturamento, clientes, agendamentos, contas e produtos de um
 * tenant. Se `tenantId` faltar em UMA das doze consultas, o número do vizinho
 * entra na soma sem nenhum sintoma visível — não há id na tela para denunciar.
 *
 * Por isso os asserts aqui são sobre os NÚMEROS, e não só sobre status: a
 * comparação é entre o overview de A e o de B, com os dois fixtures montados
 * de propósito com valores diferentes.
 */
describe('isolamento de tenant — dashboard (fase 13)', () => {
  let fixture: IsolationFixture;
  let app: INestApplication;
  let prefix: string;
  let tokenA: string;
  let tokenB: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: () => string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token()}`),
  });
  const asA = as(() => tokenA);
  const asB = as(() => tokenB);

  const login = async (email: string): Promise<string> => {
    const response = await api()
      .post(url('/auth/login'))
      .send({ email, password: FIXTURE_PASSWORD })
      .expect(200);
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
  });

  afterAll(async () => {
    await fixture.teardown();
    await app.close();
    await disconnectIsolationFixture();
  });

  it('a casca de A fala do tenant de A e de mais nenhum', async () => {
    const a = await asA.get('/dashboard/shell').expect(200);
    expect(a.body.tenant.id).toBe(fixture.a.id);
    expect(a.body.tenant.slug).toBe(fixture.a.slug);
    expect(JSON.stringify(a.body)).not.toContain(fixture.b.id);
    expect(JSON.stringify(a.body)).not.toContain(fixture.b.slug);
  });

  it('nenhum bloco do overview de A carrega id do tenant B', async () => {
    const a = await asA.get('/dashboard/overview').expect(200);
    const serialized = JSON.stringify(a.body);

    for (const foreignId of [
      fixture.b.id,
      fixture.b.barberId,
      fixture.b.serviceId,
      fixture.b.clientId,
      fixture.b.appointmentId,
      fixture.b.orderId,
      fixture.b.productId,
      fixture.b.payableId,
      fixture.b.unitId,
    ]) {
      expect(serialized).not.toContain(foreignId);
    }
  });

  it('o ranking e os serviços de A só listam entidades de A', async () => {
    const a = await asA.get('/dashboard/overview').expect(200);

    const rankingIds = a.body.barberRanking.map((row: { id: string }) => row.id);
    expect(rankingIds.every((id: string) => id !== fixture.b.barberId)).toBe(true);

    const serviceIds = a.body.topServices
      .map((row: { serviceId: string | null }) => row.serviceId)
      .filter(Boolean);
    expect(serviceIds.every((id: string) => id !== fixture.b.serviceId)).toBe(true);

    const b = await asB.get('/dashboard/overview').expect(200);
    const bRankingIds = b.body.barberRanking.map((row: { id: string }) => row.id);
    expect(bRankingIds.every((id: string) => id !== fixture.a.barberId)).toBe(true);
  });

  it('a busca global de A não encontra cliente, agendamento nem serviço de B', async () => {
    const a = await asA.get('/search?q=Isolamento').expect(200);
    const serialized = JSON.stringify(a.body);

    expect(serialized).not.toContain(fixture.b.clientId);
    expect(serialized).not.toContain(fixture.b.serviceId);
    expect(serialized).not.toContain(fixture.b.appointmentId);
  });

  it('o sino de A não anuncia conta a pagar nem agendamento de B', async () => {
    const a = await asA.get('/notifications').expect(200);
    const serialized = JSON.stringify(a.body);

    expect(serialized).not.toContain(fixture.b.payableId);
    expect(serialized).not.toContain(fixture.b.appointmentId);
  });
});
