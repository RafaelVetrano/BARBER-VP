import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PrismaClient, SubscriptionStatus, TokenAudience as PrismaTokenAudience } from '@prisma/client';
import { Role, TokenAudience } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CONFIG, type AppConfig } from '../../src/config/configuration';
import { AccessTokenService } from '../../src/auth/tokens/access-token.service';
import { SessionService } from '../../src/auth/tokens/session.service';

/**
 * Isolamento de tenant na área do cliente (fase 05).
 *
 * O `Client` é GLOBAL — diferente do booking público (fase 04), onde cada
 * tenant tem clientes próprios, aqui o caso interessante é o MESMO cliente com
 * histórico em DUAS barbearias. `MinhaConta`/`AssinaturaCliente` abrem sempre
 * escopadas ao tenant da URL (`/{slug}`), então a pergunta que importa é:
 * abrindo a conta pela barbearia A, algum dado da B vaza?
 */
describe('isolamento de tenant — área do cliente (fase 05)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slugA = `e2e-iso-conta-a-${run}`;
  const slugB = `e2e-iso-conta-b-${run}`;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  let tenantAId: string;
  let tenantBId: string;
  let clientId: string;
  let accessToken: string;
  let subscriptionBId: string;
  let appointmentBId: string;

  const auth = {
    get: (path: string) => api().get(path).set('Authorization', `Bearer ${accessToken}`),
  };

  async function createTenant(slug: string, name: string) {
    const tenant = await prisma.tenant.create({
      data: { slug, name, settings: { create: {} } },
      select: { id: true },
    });
    return tenant.id;
  }

  beforeAll(async () => {
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

    tenantAId = await createTenant(slugA, 'Tenant A — área do cliente (iso)');
    tenantBId = await createTenant(slugB, 'Tenant B — área do cliente (iso)');

    // UM cliente global, com histórico nas duas barbearias.
    const phone = `9998${run}`;
    const client = await prisma.client.create({
      data: { phone, name: 'Cliente Cross-Tenant', phoneVerifiedAt: new Date() },
      select: { id: true },
    });
    clientId = client.id;

    const [barberA, serviceA] = await Promise.all([
      prisma.barber.create({ data: { tenantId: tenantAId, name: 'Barbeiro A' }, select: { id: true } }),
      prisma.service.create({
        data: { tenantId: tenantAId, name: 'Serviço A', durationMin: 30, priceCents: 3_000 },
        select: { id: true },
      }),
    ]);
    await prisma.appointment.create({
      data: {
        tenantId: tenantAId,
        bookingCode: `AG-ISOA-${run}`,
        barberId: barberA.id,
        serviceId: serviceA.id,
        clientId,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000),
        priceCents: 3_000,
        services: {
          create: { tenantId: tenantAId, serviceId: serviceA.id, priceCents: 3_000, durationMin: 30 },
        },
      },
    });

    const [barberB, serviceB] = await Promise.all([
      prisma.barber.create({ data: { tenantId: tenantBId, name: 'Barbeiro B' }, select: { id: true } }),
      prisma.service.create({
        data: { tenantId: tenantBId, name: 'Serviço B', durationMin: 30, priceCents: 5_000 },
        select: { id: true },
      }),
    ]);
    const appointmentB = await prisma.appointment.create({
      data: {
        tenantId: tenantBId,
        bookingCode: `AG-ISOB-${run}`,
        barberId: barberB.id,
        serviceId: serviceB.id,
        clientId,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000),
        priceCents: 5_000,
        services: {
          create: { tenantId: tenantBId, serviceId: serviceB.id, priceCents: 5_000, durationMin: 30 },
        },
      },
      select: { id: true },
    });
    appointmentBId = appointmentB.id;

    const planB = await prisma.clientPlan.create({
      data: { tenantId: tenantBId, name: 'Plano B', priceCents: 10_000, billingDay: 5 },
      select: { id: true },
    });
    const subscriptionB = await prisma.clientSubscription.create({
      data: {
        tenantId: tenantBId,
        clientId,
        planId: planB.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
      select: { id: true },
    });
    subscriptionBId = subscriptionB.id;

    // Token de cliente emitido direto pelos serviços de auth, sem passar pelo
    // fluxo de OTP/senha: o alvo deste teste é o isolamento por tenant, e o
    // login em si já está coberto à exaustão em `client-account.e2e-spec.ts`.
    const accessTokens = app.get(AccessTokenService);
    const sessions = app.get(SessionService);
    const issued = await sessions.issue({ audience: PrismaTokenAudience.CLIENT, clientId });
    accessToken = accessTokens.sign({
      subjectId: clientId,
      audience: TokenAudience.CLIENT,
      tenantId: null,
      roles: [Role.CLIENT],
      isSuperAdmin: false,
      sessionId: issued.session.id,
    });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await app.close();
    await prisma.$disconnect();
  });

  it('agendamentos de A não aparecem na conta aberta pela barbearia B', async () => {
    const response = await auth.get(url(`/public/${slugB}/account/appointments`)).expect(200);

    const allIds = [...response.body.upcoming, ...response.body.history].map(
      (item: { id: string }) => item.id,
    );
    expect(allIds).toContain(appointmentBId);
    expect(allIds.every((id: string) => id !== undefined)).toBe(true);

    // Nenhuma linha do tenant A pode aparecer numa consulta escopada em B.
    const leaked = await prisma.appointment.findMany({
      where: { tenantId: tenantAId, id: { in: allIds } },
    });
    expect(leaked).toHaveLength(0);
  });

  it('a assinatura de B não aparece quando a conta é aberta pela barbearia A', async () => {
    const response = await auth.get(url(`/public/${slugA}/account/subscription`)).expect(200);

    expect(response.body.subscription).toBeNull();
  });

  it('a assinatura de B só aparece abrindo a conta pela própria barbearia B', async () => {
    const response = await auth.get(url(`/public/${slugB}/account/subscription`)).expect(200);

    expect(response.body.subscription?.id).toBe(subscriptionBId);
  });

  it('a exportação LGPD (global, fora do slug) traz as DUAS barbearias — é o titular vendo os próprios dados', async () => {
    const response = await auth.get(url('/client-auth/me/export')).expect(200);

    const tenantNames = response.body.appointments.map((row: { tenantName: string }) => row.tenantName);
    expect(tenantNames).toEqual(
      expect.arrayContaining(['Tenant A — área do cliente (iso)', 'Tenant B — área do cliente (iso)']),
    );
  });
});
