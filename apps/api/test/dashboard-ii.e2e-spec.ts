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
 * Dashboard II (fase 07) de ponta a ponta, contra o banco real.
 *
 * Caso central do critério de aceite: ciclo completo agendamento → comanda →
 * fechamento → comissão → relatório, com os valores batendo. Cobre também o
 * "tudo ou nada" do fechamento (soma de pagamentos que não bate não fecha
 * nada) e a reabertura restrita a MANAGER+.
 */
describe('dashboard II — comandas/financeiro/comissões (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-d2-${run}`;
  const password = 'DashboardDoisSenha1';

  let tenantId: string;
  let ownerToken: string;
  let barberToken: string;
  let barberId: string;
  let serviceId: string;
  let productId: string;
  let clientId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const asOwner = () => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${ownerToken}`),
  });
  const asBarber = () => ({
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${barberToken}`),
  });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const saasPlan = await prisma.saasPlan.create({
      data: {
        code: `e2e-avancado-d2-${run}`,
        name: 'Avançado (e2e d2)',
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
        name: 'Barbearia Dashboard II (e2e)',
        planId: saasPlan.id,
        settings: { create: { allowOnlineBooking: true } },
        loyaltyProgram: { create: { active: true, gastoPorPonto: 100, pontosParaDesconto: 100, valorDesconto: 1_000 } },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const commissionRule = await prisma.commissionRule.create({
      data: { tenantId, name: 'Fixa 40% (e2e)', type: 'FIXED', percentBps: 4_000 },
      select: { id: true },
    });

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-d2-owner-${run}@barbervp.test`;
    const barberEmail = `e2e-d2-barber-${run}@barbervp.test`;

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dono D2',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });

    const barberUser = await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro D2',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
      select: { id: true },
    });

    const barber = await prisma.barber.create({
      data: { tenantId, userId: barberUser.id, name: 'Barbeiro D2', commissionRuleId: commissionRule.id },
      select: { id: true },
    });
    barberId = barber.id;

    const service = await prisma.service.create({
      data: { tenantId, name: 'Corte D2', durationMin: 30, priceCents: 5_000 },
      select: { id: true },
    });
    serviceId = service.id;

    const product = await prisma.product.create({
      data: { tenantId, name: 'Pomada D2', priceCents: 2_000, stock: 10, estoqueMin: 2 },
      select: { id: true },
    });
    productId = product.id;

    const client = await prisma.client.create({
      data: {
        phone: `9998${run}`,
        name: 'Cliente D2',
        profiles: { create: { tenantId, phone: `9998${run}` } },
      },
      select: { id: true },
    });
    clientId = client.id;

    const loginOwner = await api()
      .post(url('/auth/login'))
      .send({ email: ownerEmail, password })
      .expect(200);
    ownerToken = loginOwner.body.accessToken;

    const loginBarber = await api()
      .post(url('/auth/login'))
      .send({ email: barberEmail, password })
      .expect(200);
    barberToken = loginBarber.body.accessToken;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.saasPlan.deleteMany({ where: { code: `e2e-avancado-d2-${run}` } });
    await prisma.$disconnect();
    await app.close();
  });

  it('fecha a comanda em transação única: pagamento que não bate não fecha nada', async () => {
    const opened = await asOwner()
      .post('/orders')
      .send({ clientId, barberId })
      .expect(201);
    const orderId = opened.body.id as string;

    await asOwner()
      .post(`/orders/${orderId}/items`)
      .send({ kind: 'SERVICE', serviceId, barberId })
      .expect(201);

    await asOwner()
      .post(`/orders/${orderId}/close`)
      .send({ payments: [{ method: 'CASH', amountCents: 1 }] })
      .expect(400);

    const stillOpen = await asOwner().get(`/orders/${orderId}`).expect(200);
    expect(stillOpen.body.status).toBe('OPEN');
  });

  it('ciclo completo: comanda → fechamento → estoque → comissão → fidelidade → relatório', async () => {
    const stockBefore = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } });

    const opened = await asOwner().post('/orders').send({ clientId, barberId }).expect(201);
    const orderId = opened.body.id as string;

    await asOwner()
      .post(`/orders/${orderId}/items`)
      .send({ kind: 'SERVICE', serviceId, barberId })
      .expect(201);

    const withProduct = await asOwner()
      .post(`/orders/${orderId}/items`)
      .send({ kind: 'PRODUCT', productId, barberId, quantity: 2 })
      .expect(201);

    // 5.000 (serviço) + 2×2.000 (produto) = 9.000
    expect(withProduct.body.totalCents).toBe(9_000);

    const closed = await asOwner()
      .post(`/orders/${orderId}/close`)
      .send({ payments: [{ method: 'PIX', amountCents: 9_000 }] })
      .expect(201);
    expect(closed.body.status).toBe('CLOSED');
    expect(closed.body.totalCents).toBe(9_000);

    // Estoque baixou exatamente 2 unidades.
    const stockAfter = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } });
    expect(stockAfter.stock).toBe(stockBefore.stock - 2);

    // Comissão: 40% sobre os 5.000 do SERVIÇO (produto não comissiona).
    const entry = await prisma.commissionEntry.findFirstOrThrow({
      where: { tenantId, barberId, orderId },
    });
    expect(entry.baseCents).toBe(5_000);
    expect(entry.percentBps).toBe(4_000);
    expect(entry.amountCents).toBe(2_000);
    expect(entry.status).toBe('PENDING');

    // Fidelidade: Math.round(subtotal / gastoPorPonto) = round(9000/100) = 90 pontos.
    const points = await prisma.loyaltyPoints.findFirstOrThrow({ where: { tenantId, clientId, orderId } });
    expect(points.points).toBe(90);

    const month = new Date().toISOString().slice(0, 7);
    const period = await asOwner().get(`/commissions/period?month=${month}`).expect(200);
    const barberSummary = period.body.barbers.find((b: { barberId: string }) => b.barberId === barberId);
    expect(barberSummary.comissaoCents).toBeGreaterThanOrEqual(2_000);
    expect(barberSummary.status).toBe('PENDING');

    const closePeriod = await asOwner().post('/commissions/period/close').send({ month }).expect(201);
    const closedSummary = closePeriod.body.barbers.find((b: { barberId: string }) => b.barberId === barberId);
    expect(closedSummary.status).toBe('PAID');

    const report = await asOwner().get('/reports/summary').expect(200);
    expect(report.body.revenueCents).toBeGreaterThanOrEqual(9_000);
  });

  it('reabertura de comanda fechada só MANAGER+ e fica auditada', async () => {
    const opened = await asOwner().post('/orders').send({ clientId, barberId }).expect(201);
    const orderId = opened.body.id as string;
    await asOwner().post(`/orders/${orderId}/items`).send({ kind: 'SERVICE', serviceId, barberId }).expect(201);
    await asOwner()
      .post(`/orders/${orderId}/close`)
      .send({ payments: [{ method: 'CASH', amountCents: 5_000 }] })
      .expect(201);

    await asBarber().post(`/orders/${orderId}/reopen`).send({ reason: 'teste' }).expect(403);

    await asOwner().post(`/orders/${orderId}/reopen`).send({ reason: 'cliente esqueceu um item' }).expect(201);

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'pos.order_reopened', entityId: orderId },
    });
    expect(audit).not.toBeNull();
  });
});
