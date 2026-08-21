import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Fase 13 — a tela `/app` de ponta a ponta.
 *
 * O que estes casos protegem, e por que:
 *
 * 1. **Recorte por papel.** `BARBER` não pode ver o faturamento da barbearia
 *    inteira nem os alertas de gestão. É a regra que o protótipo não tinha e o
 *    critério de aceite exige.
 * 2. **Gate de plano server-side.** Sem `contasPagarReceber`, o alerta de
 *    contas não vem — e o motivo vem junto, em `lockedByPlan`.
 * 3. **Tenant vazio.** A página tem de renderizar inteira, com todos os
 *    blocos em estado vazio; nenhum campo pode sumir do contrato.
 */
describe('dashboard overview (fase 13, e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-d13-${run}`;
  const emptySlug = `e2e-d13-vazio-${run}`;
  const password = 'DashboardTrezeSenha1';

  let tenantId: string;
  let ownerToken: string;
  let barberToken: string;
  let emptyOwnerToken: string;
  let ownBarberId: string;
  let otherBarberId: string;
  let serviceId: string;
  let clientId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
  });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const [avancado, essencial] = await Promise.all([
      prisma.saasPlan.create({
        data: {
          code: `e2e-avancado-d13-${run}`,
          name: 'Avançado (e2e d13)',
          priceCents: 13_900,
          tier: PlanTier.AVANCADO,
          maxBarbers: null,
          features: featuresForTier(PlanTier.AVANCADO) as unknown as object,
        },
        select: { id: true },
      }),
      prisma.saasPlan.create({
        data: {
          code: `e2e-essencial-d13-${run}`,
          name: 'Essencial (e2e d13)',
          priceCents: 4_900,
          tier: PlanTier.ESSENCIAL,
          maxBarbers: 2,
          features: featuresForTier(PlanTier.ESSENCIAL) as unknown as object,
        },
        select: { id: true },
      }),
    ]);

    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: 'Barbearia D13 (e2e)',
        planId: avancado.id,
        settings: { create: { monthlyGoalCents: 2_800_000 } },
        // Expediente 09:00–18:00 de segunda a sábado — a base da ocupação.
        businessHours: {
          create: Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            opensAt: 540,
            closesAt: 1_080,
            closed: weekday === 0,
          })),
        },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const emptyTenant = await prisma.tenant.create({
      data: { slug: emptySlug, name: 'Barbearia vazia D13 (e2e)', planId: essencial.id },
      select: { id: true },
    });

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-d13-owner-${run}@barbervp.test`;
    const barberEmail = `e2e-d13-barber-${run}@barbervp.test`;
    const emptyEmail = `e2e-d13-vazio-${run}@barbervp.test`;

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dono D13',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });
    await prisma.user.create({
      data: {
        email: emptyEmail,
        name: 'Dono vazio D13',
        passwordHash,
        memberships: { create: { tenantId: emptyTenant.id, role: MembershipRole.OWNER } },
      },
    });
    const barberUser = await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro D13',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
      select: { id: true },
    });

    const [own, other] = await Promise.all([
      prisma.barber.create({
        data: { tenantId, userId: barberUser.id, name: 'Barbeiro D13' },
        select: { id: true },
      }),
      prisma.barber.create({ data: { tenantId, name: 'Colega D13' }, select: { id: true } }),
    ]);
    ownBarberId = own.id;
    otherBarberId = other.id;

    const service = await prisma.service.create({
      data: { tenantId, name: 'Corte D13', durationMin: 30, priceCents: 5_000 },
      select: { id: true },
    });
    serviceId = service.id;

    const client = await prisma.client.create({
      data: {
        phone: `9913${run}`,
        name: 'Cliente D13',
        profiles: { create: { tenantId, phone: `9913${run}`, firstVisitAt: new Date() } },
      },
      select: { id: true },
    });
    clientId = client.id;

    // Uma comanda fechada por barbeiro, hoje — é o que separa "os meus" de
    // "os da barbearia" no ranking e no faturamento.
    await seedClosedOrder(prisma, tenantId, ownBarberId, serviceId, clientId, 1, 5_000);
    await seedClosedOrder(prisma, tenantId, otherBarberId, serviceId, clientId, 2, 9_000);

    // Conta vencendo esta semana — a base do alerta gated por plano.
    await prisma.accountPayable.create({
      data: {
        tenantId,
        description: 'Aluguel D13',
        category: 'Aluguel',
        amountCents: 150_000,
        dueDate: new Date(new Date().toISOString().slice(0, 10)),
        status: 'PENDING',
      },
    });

    const tokens = await Promise.all([
      api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200),
      api().post(url('/auth/login')).send({ email: barberEmail, password }).expect(200),
      api().post(url('/auth/login')).send({ email: emptyEmail, password }).expect(200),
    ]);
    ownerToken = tokens[0].body.accessToken;
    barberToken = tokens[1].body.accessToken;
    emptyOwnerToken = tokens[2].body.accessToken;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, emptySlug] } } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.saasPlan.deleteMany({
      where: { code: { in: [`e2e-avancado-d13-${run}`, `e2e-essencial-d13-${run}`] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('a casca devolve plano, features e unidades — e nada de plano vira tudo bloqueado', async () => {
    const owner = await as(ownerToken).get('/dashboard/shell').expect(200);
    expect(owner.body.plan.code).toBe(`e2e-avancado-d13-${run}`);
    expect(owner.body.plan.isMaxTier).toBe(true);
    expect(owner.body.features.multiUnidades).toBe(true);
    expect(owner.body.role).toBe('OWNER');

    const essencial = await as(emptyOwnerToken).get('/dashboard/shell').expect(200);
    expect(essencial.body.features.contasPagarReceber).toBe(false);
    expect(essencial.body.features.multiUnidades).toBe(false);
    // Sem `multiUnidades` a lista de unidades sai vazia — o seletor mostra só
    // a barbearia e o "+ Nova unidade" com cadeado.
    expect(essencial.body.units).toEqual([]);
  });

  it('OWNER enxerga a barbearia inteira; BARBER, só os próprios números', async () => {
    const owner = await as(ownerToken).get('/dashboard/overview').expect(200);
    expect(owner.body.scope).toBe('TENANT');
    expect(owner.body.kpis.revenueTodayCents).toBe(14_000);
    expect(owner.body.barberRanking).toHaveLength(2);

    const barber = await as(barberToken).get('/dashboard/overview').expect(200);
    expect(barber.body.scope).toBe('BARBER');
    expect(barber.body.kpis.revenueTodayCents).toBe(5_000);
    expect(barber.body.barberRanking).toHaveLength(1);
    expect(barber.body.barberRanking[0].id).toBe(ownBarberId);
    // Nenhum número do colega escapa por nenhum campo.
    expect(JSON.stringify(barber.body)).not.toContain(otherBarberId);
  });

  it('BARBER não recebe alertas de gestão — os botões levariam a telas que ele não abre', async () => {
    const barber = await as(barberToken).get('/dashboard/overview').expect(200);
    expect(barber.body.alerts.dueBills).toBeNull();
    expect(barber.body.alerts.cashRegisterOpen).toBeNull();
    expect(barber.body.alerts.inactiveClients).toBe(0);
    expect(barber.body.alerts.birthdays).toBe(0);
  });

  it('o gate de plano some com o alerta de contas e diz por quê', async () => {
    const comPlano = await as(ownerToken).get('/dashboard/overview').expect(200);
    expect(comPlano.body.alerts.dueBills).toEqual({ count: 1, totalCents: 150_000 });
    expect(comPlano.body.lockedByPlan).toEqual([]);

    const semPlano = await as(emptyOwnerToken).get('/dashboard/overview').expect(200);
    expect(semPlano.body.alerts.dueBills).toBeNull();
    expect(semPlano.body.lockedByPlan).toContain('contasPagarReceber');
  });

  it('tenant vazio devolve o contrato inteiro, zerado — nenhum bloco some', async () => {
    const vazio = await as(emptyOwnerToken).get('/dashboard/overview').expect(200);

    expect(vazio.body.kpis.revenueTodayCents).toBe(0);
    // `null` e não `0`: sem base de comparação, "não mudou" seria mentira.
    expect(vazio.body.kpis.revenueDeltaPct).toBeNull();
    expect(vazio.body.kpis.revenueSparkline).toHaveLength(8);
    expect(vazio.body.kpis.occupancyPct).toBe(0);
    expect(vazio.body.topServices).toEqual([]);
    expect(vazio.body.barberRanking).toEqual([]);
    expect(vazio.body.upcomingAppointments).toEqual([]);
    expect(vazio.body.revenueChart.goalCents).toBeNull();
  });

  it('o recorte do gráfico troca de granularidade e a meta acompanha o balde', async () => {
    const mes = await as(ownerToken).get('/dashboard/overview?period=mes').expect(200);
    expect(mes.body.revenueChart.points).toHaveLength(30);
    expect(mes.body.revenueChart.goalCents).toBe(2_800_000);

    const semana = await as(ownerToken).get('/dashboard/overview?period=semana').expect(200);
    expect(semana.body.revenueChart.points).toHaveLength(7);

    const dia = await as(ownerToken).get('/dashboard/overview?period=dia').expect(200);
    // Expediente 09h–18h → 10 rótulos horários.
    expect(dia.body.revenueChart.points).toHaveLength(10);
    expect(dia.body.revenueChart.points[0].label).toBe('09h');
    // A meta por ponto no recorte de hora é menor que no de dia — o protótipo
    // dividia por 30 nos três recortes e punha a linha no lugar errado.
    expect(dia.body.revenueChart.goalPerPointCents).toBeLessThan(
      mes.body.revenueChart.goalPerPointCents,
    );

    await as(ownerToken).get('/dashboard/overview?period=trimestre').expect(400);
  });

  it('a busca global acha cliente e serviço; BARBER não recebe a base de clientes', async () => {
    const owner = await as(ownerToken).get('/search?q=Cliente D13').expect(200);
    expect(owner.body.clients.map((c: { id: string }) => c.id)).toContain(clientId);

    const porServico = await as(ownerToken).get('/search?q=Corte D13').expect(200);
    expect(porServico.body.services.map((s: { id: string }) => s.id)).toContain(serviceId);

    const barber = await as(barberToken).get('/search?q=Cliente D13').expect(200);
    expect(barber.body.clients).toEqual([]);

    // Termo curto demais é 400, não uma varredura da base inteira.
    await as(ownerToken).get('/search?q=a').expect(400);
  });

  it('o sino devolve pendências reais e some com as de gestão para o BARBER', async () => {
    const owner = await as(ownerToken).get('/notifications').expect(200);
    expect(owner.body.count).toBe(owner.body.items.length);
    expect(owner.body.items.map((item: { kind: string }) => item.kind)).toContain('BILL_DUE');

    const barber = await as(barberToken).get('/notifications').expect(200);
    expect(barber.body.items.map((item: { kind: string }) => item.kind)).not.toContain('BILL_DUE');
    expect(barber.body.items.map((item: { kind: string }) => item.kind)).not.toContain(
      'CASH_REGISTER_CLOSED',
    );
  });
});

/** Comanda fechada hoje — o insumo de faturamento, ticket médio e ranking. */
async function seedClosedOrder(
  prisma: PrismaClient,
  tenantId: string,
  barberId: string,
  serviceId: string,
  clientId: string,
  number: number,
  totalCents: number,
): Promise<void> {
  await prisma.order.create({
    data: {
      tenantId,
      clientId,
      barberId,
      number,
      status: 'CLOSED',
      subtotalCents: totalCents,
      totalCents,
      closedAt: new Date(),
      items: {
        create: {
          tenantId,
          kind: 'SERVICE',
          serviceId,
          barberId,
          description: 'Corte D13',
          quantity: 1,
          unitPriceCents: totalCents,
          totalCents,
        },
      },
    },
  });
}
