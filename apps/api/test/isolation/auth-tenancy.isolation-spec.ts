import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { TENANT_HEADER } from '@barbervp/types';
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
 * Isolamento de tenant da fase 03 — casos HTTP, com token de verdade.
 *
 * O arnês (`harness.isolation-spec.ts`) prova o isolamento no nível do banco.
 * Aqui o teste sobe a aplicação inteira, com a mesma cadeia de guards de
 * produção, e ataca a fronteira pela borda: token do tenant A tentando alcançar
 * o tenant B, por todos os caminhos que um cliente HTTP tem à disposição.
 */
describe('isolamento de tenant — auth & tenancy (fase 03)', () => {
  let fixture: IsolationFixture;
  let app: INestApplication;
  let prefix: string;
  let tokenA: string;
  let tokenB: string;

  const login = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post(`/${prefix}/auth/login`)
      .send({ email, password: FIXTURE_PASSWORD })
      .expect(200);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    fixture = await setupIsolationFixture();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    tokenA = await login(fixture.a.ownerEmail);
    tokenB = await login(fixture.b.ownerEmail);
  });

  afterAll(async () => {
    await app.close();
    await fixture.teardown();
    await disconnectIsolationFixture();
  });

  it('o token carrega o tenant do próprio dono, e são tenants diferentes', async () => {
    const [meA, meB] = await Promise.all([
      request(app.getHttpServer())
        .get(`/${prefix}/auth/me`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200),
      request(app.getHttpServer())
        .get(`/${prefix}/auth/me`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200),
    ]);

    expect(meA.body.memberships).toHaveLength(1);
    expect(meA.body.memberships[0].tenantId).toBe(fixture.a.id);
    expect(meB.body.memberships[0].tenantId).toBe(fixture.b.id);
  });

  it('cada dono só enxerga a própria barbearia no onboarding', async () => {
    const [stateA, stateB] = await Promise.all([
      request(app.getHttpServer())
        .get(`/${prefix}/onboarding`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200),
      request(app.getHttpServer())
        .get(`/${prefix}/onboarding`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200),
    ]);

    expect(stateA.body.identity.slug).toBe(fixture.a.slug);
    expect(stateB.body.identity.slug).toBe(fixture.b.slug);
  });

  it('o header de tenant NÃO sobrepõe o tenant do JWT', async () => {
    // Este é o coração da regra 3: mesmo mandando o slug do vizinho, o tenant
    // servido continua sendo o do token.
    const response = await request(app.getHttpServer())
      .get(`/${prefix}/onboarding`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set(TENANT_HEADER, fixture.b.slug)
      .expect(200);

    expect(response.body.identity.slug).toBe(fixture.a.slug);
    expect(response.body.identity.slug).not.toBe(fixture.b.slug);
  });

  it('assumir o contexto de um tenant alheio responde 403 TENANT_MISMATCH', async () => {
    const response = await request(app.getHttpServer())
      .post(`/${prefix}/auth/context`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ tenantId: fixture.b.id })
      .expect(403);

    expect(response.body.code).toBe('TENANT_MISMATCH');
  });

  it('escrever no onboarding do tenant A não toca em nada do tenant B', async () => {
    await request(app.getHttpServer())
      .put(`/${prefix}/onboarding/services`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        services: [{ name: 'Serviço só do A', durationMin: 30, priceCents: 3_000 }],
      })
      .expect(200);

    const servicesB = await fixture.prisma.service.findMany({
      where: { tenantId: fixture.b.id, deletedAt: null },
      select: { name: true, tenantId: true },
    });

    fixture.expectOnlyTenant(servicesB, fixture.b);
    expect(servicesB.map((service) => service.name)).not.toContain('Serviço só do A');

    const servicesA = await fixture.prisma.service.findMany({
      where: { tenantId: fixture.a.id, deletedAt: null, active: true },
      select: { name: true, tenantId: true },
    });
    fixture.expectOnlyTenant(servicesA, fixture.a);
    expect(servicesA.map((service) => service.name)).toContain('Serviço só do A');
  });

  it('membership em um tenant não concede papel no outro', async () => {
    const membershipsOfA = await fixture.prisma.membership.findMany({
      where: { userId: fixture.a.ownerUserId },
      select: { tenantId: true, role: true },
    });

    expect(membershipsOfA).toHaveLength(1);
    expect(membershipsOfA[0]!.tenantId).toBe(fixture.a.id);
  });

  it('sem token, rota de painel responde 401', async () => {
    const response = await request(app.getHttpServer()).get(`/${prefix}/onboarding`).expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('token de cliente não abre rota de painel', async () => {
    // Um cliente logado é um principal válido — mas sem tenant e sem papel de
    // estabelecimento, então a fronteira o barra antes de qualquer consulta.
    const phone = `5516${Date.now().toString().slice(-9)}`;
    const client = await fixture.prisma.client.create({
      data: { phone, name: 'Cliente Isolamento', phoneVerifiedAt: new Date() },
      select: { id: true },
    });

    try {
      const session = await fixture.prisma.authSession.create({
        data: {
          audience: 'CLIENT',
          clientId: client.id,
          refreshHash: 'nao-usado-neste-teste',
          familyId: 'iso-client',
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        select: { id: true },
      });

      const { AccessTokenService } = await import('../../src/auth/tokens/access-token.service');
      const accessTokens = app.get(AccessTokenService);
      const clientToken = accessTokens.sign({
        subjectId: client.id,
        audience: 'bvp:client',
        tenantId: null,
        roles: ['CLIENT'],
        isSuperAdmin: false,
        sessionId: session.id,
      });

      const response = await request(app.getHttpServer())
        .get(`/${prefix}/onboarding`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);

      expect(['TENANT_REQUIRED', 'FORBIDDEN']).toContain(response.body.code);
    } finally {
      await fixture.prisma.client.delete({ where: { id: client.id } });
    }
  });
});
