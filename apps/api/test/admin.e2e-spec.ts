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
 * Super Admin (fase 08) de ponta a ponta, contra o banco real.
 *
 * Critérios de aceite cobertos: (1) trocar o plano de um tenant reflete
 * IMEDIATAMENTE no feature flag que o dashboard daquele tenant consulta —
 * 403 antes, 200 depois; (2) suspender bloqueia login de TODOS os
 * `Membership`s do tenant; (3) impersonar o OWNER gera `AuditLog` e devolve
 * uma sessão com o papel/identidade REAIS do dono (não do super admin);
 * (4) só `SUPER_ADMIN` acessa `/admin/*`; (5) o fluxo de inadimplência
 * (recusar N vezes) suspende o tenant sozinho.
 */
describe('super admin (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const password = 'SuperAdminSenha1';

  let superAdminToken: string;
  let tenantId: string;
  let ownerEmail: string;
  let barberEmail: string;
  let essencialPlanId: string;
  let avancadoPlanId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const asAdmin = () => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${superAdminToken}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${superAdminToken}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${superAdminToken}`),
  });

  const cleanupPlanCodes: string[] = [];
  const cleanupSlugs: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

    // Super admin de teste — não reusa o `admin@barbervp.com.br` do seed pra
    // não colidir com outra suíte rodando em paralelo.
    const superAdminEmail = `e2e-admin-${run}@barbervp.test`;
    await prisma.user.create({
      data: { email: superAdminEmail, name: 'Super Admin e2e', passwordHash, isSuperAdmin: true },
    });
    const loginAdmin = await api()
      .post(url('/auth/login'))
      .send({ email: superAdminEmail, password })
      .expect(200);
    superAdminToken = loginAdmin.body.accessToken;

    // Planos essencial/avançado próprios do teste, para não depender do seed.
    const essencial = await prisma.saasPlan.create({
      data: {
        code: `e2e-essencial-${run}`,
        name: 'Essencial e2e',
        priceCents: 4_900,
        tier: PlanTier.ESSENCIAL,
        maxBarbers: 2,
        features: featuresForTier(PlanTier.ESSENCIAL) as unknown as object,
      },
      select: { id: true, code: true },
    });
    essencialPlanId = essencial.id;
    cleanupPlanCodes.push(essencial.code);

    const avancado = await prisma.saasPlan.create({
      data: {
        code: `e2e-avancado-${run}`,
        name: 'Avançado e2e',
        priceCents: 13_900,
        tier: PlanTier.AVANCADO,
        maxBarbers: null,
        features: featuresForTier(PlanTier.AVANCADO) as unknown as object,
      },
      select: { id: true, code: true },
    });
    avancadoPlanId = avancado.id;
    cleanupPlanCodes.push(avancado.code);

    // Tenant de teste no plano Essencial, com OWNER e um BARBER.
    const slug = `e2e-admin-tenant-${run}`;
    cleanupSlugs.push(slug);
    const tenant = await prisma.tenant.create({
      data: { slug, name: 'Tenant Admin e2e', planId: essencialPlanId, settings: { create: {} } },
      select: { id: true },
    });
    tenantId = tenant.id;

    await prisma.tenantSubscription.create({
      data: {
        tenantId,
        planId: essencialPlanId,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() - 1000), // já vencido, pra runCycle pegar
      },
    });

    ownerEmail = `e2e-admin-owner-${run}@barbervp.test`;
    await prisma.user.create({
      data: { email: ownerEmail, name: 'Dono Alvo', passwordHash, memberships: { create: { tenantId, role: MembershipRole.OWNER } } },
    });
    barberEmail = `e2e-admin-barber-${run}@barbervp.test`;
    await prisma.user.create({
      data: { email: barberEmail, name: 'Barbeiro Alvo', passwordHash, memberships: { create: { tenantId, role: MembershipRole.BARBER } } },
    });
  });

  afterAll(async () => {
    for (const slug of cleanupSlugs) {
      await prisma.tenant.deleteMany({ where: { slug } });
    }
    for (const code of cleanupPlanCodes) {
      await prisma.saasPlan.deleteMany({ where: { code } });
    }
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, barberEmail] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('só SUPER_ADMIN acessa /admin/* — OWNER toma 403', async () => {
    const loginOwner = await api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200);
    const ownerToken = loginOwner.body.accessToken;

    await api().get(url('/admin/tenants')).set('Authorization', `Bearer ${ownerToken}`).expect(403);
    await api().get(url('/admin/plans')).set('Authorization', `Bearer ${ownerToken}`).expect(403);
    await api().get(url('/admin/metrics')).set('Authorization', `Bearer ${ownerToken}`).expect(403);
  });

  it('trocar o plano reflete IMEDIATAMENTE no feature flag do tenant (403 → 200)', async () => {
    const loginOwner = await api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200);
    const ownerToken = loginOwner.body.accessToken;

    // Essencial não tem `comissoes` — 403 antes da troca.
    await api()
      .get(url('/commissions/period?month=2026-08'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);

    await asAdmin().patch(`/admin/tenants/${tenantId}/plan`).send({ planId: avancadoPlanId }).expect(200);

    // MESMO token, ainda válido — o gate lê o plano do tenant a cada
    // requisição, não algo carimbado no JWT no momento do login.
    await api()
      .get(url('/commissions/period?month=2026-08'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  });

  it('suspender bloqueia login de TODOS os Memberships; reativar libera de novo', async () => {
    await api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200);
    await api().post(url('/auth/login')).send({ email: barberEmail, password }).expect(200);

    await asAdmin().patch(`/admin/tenants/${tenantId}/suspend`).expect(200);

    const ownerBlocked = await api().post(url('/auth/login')).send({ email: ownerEmail, password });
    expect(ownerBlocked.status).toBe(403);
    expect(ownerBlocked.body.code).toBe('TENANT_SUSPENDED');

    const barberBlocked = await api().post(url('/auth/login')).send({ email: barberEmail, password });
    expect(barberBlocked.status).toBe(403);
    expect(barberBlocked.body.code).toBe('TENANT_SUSPENDED');

    await asAdmin().patch(`/admin/tenants/${tenantId}/reactivate`).expect(200);
    await api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200);
  });

  it('impersonar o OWNER: sessão com identidade/papel REAIS do dono, sem cookie, com auditoria', async () => {
    const response = await asAdmin().post(`/admin/tenants/${tenantId}/impersonate`).expect(201);
    expect(response.body.ownerName).toBe('Dono Alvo');
    expect(response.headers['set-cookie']).toBeUndefined();

    const impersonatedToken = response.body.accessToken as string;
    const me = await api().get(url('/auth/me')).set('Authorization', `Bearer ${impersonatedToken}`).expect(200);
    expect(me.body.name).toBe('Dono Alvo');
    expect(me.body.isSuperAdmin).toBe(false);

    // A sessão impersonada FUNCIONA de verdade num endpoint escopado por tenant.
    await api().get(url('/clients')).set('Authorization', `Bearer ${impersonatedToken}`).expect(200);

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'admin.tenant_impersonated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect((audit?.metadata as { targetOwnerUserId?: string })?.targetOwnerUserId).toBeDefined();
  });

  it('não impersona tenant suspenso', async () => {
    await asAdmin().patch(`/admin/tenants/${tenantId}/suspend`).expect(200);
    await asAdmin().post(`/admin/tenants/${tenantId}/impersonate`).expect(409);
    await asAdmin().patch(`/admin/tenants/${tenantId}/reactivate`).expect(200);
  });

  it('CRUD de planos recusa feature desconhecida e lista o nº de tenants', async () => {
    const created = await asAdmin()
      .post('/admin/plans')
      .send({
        code: `e2e-custom-${run}`,
        name: 'Plano Customizado e2e',
        priceCents: 9_900,
        tier: 1,
        maxBarbers: 5,
        features: featuresForTier(PlanTier.PROFISSIONAL),
      })
      .expect(201);
    cleanupPlanCodes.push(created.body.code);

    await asAdmin()
      .post('/admin/plans')
      .send({
        code: `e2e-bad-${run}`,
        name: 'Plano inválido',
        priceCents: 100,
        tier: 0,
        features: { chaveQueNaoExiste: true },
      })
      .expect(400);

    const list = await asAdmin().get('/admin/plans').expect(200);
    // O teste anterior já trocou o tenant de essencial → avançado — conferir
    // no plano que ele está DE FATO agora, não no que estava no `beforeAll`.
    const avancadoRow = list.body.find((p: { id: string }) => p.id === avancadoPlanId);
    expect(avancadoRow.tenantCount).toBeGreaterThanOrEqual(1);
  });

  it('billing: recusar N vezes seguidas suspende o tenant automaticamente', async () => {
    // Garante ciclo vencido de novo (o teste de troca de plano acima já rodou).
    await prisma.tenantSubscription.updateMany({
      where: { tenantId },
      data: { currentPeriodEnd: new Date(Date.now() - 1000), failedAttempts: 0, status: 'ACTIVE' },
    });
    await asAdmin().patch(`/admin/tenants/${tenantId}/reactivate`).expect(200);

    const cycle = await asAdmin().post('/admin/billing/run-cycle').expect(201);
    expect(cycle.body.charged).toBeGreaterThanOrEqual(1);

    // BILLING_MAX_FAILED_ATTEMPTS padrão é 3 — recusa 3× seguidas.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const invoice = await prisma.saasInvoice.findFirst({
        where: { tenantId, status: 'PENDING' },
        orderBy: { issuedAt: 'desc' },
      });
      expect(invoice).not.toBeNull();

      const rejected = await asAdmin().post(`/admin/billing/invoices/${invoice!.id}/reject`).expect(201);

      if (attempt < 3) {
        expect(rejected.body.suspended).toBe(false);
        // Reabre um ciclo vencido novo pra próxima recusa ter fatura PENDING.
        await prisma.tenantSubscription.updateMany({
          where: { tenantId },
          data: { currentPeriodEnd: new Date(Date.now() - 1000), status: 'ACTIVE' },
        });
        await asAdmin().post('/admin/billing/run-cycle').expect(201);
      } else {
        expect(rejected.body.suspended).toBe(true);
      }
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { status: true } });
    expect(tenant.status).toBe('SUSPENDED');

    await asAdmin().patch(`/admin/tenants/${tenantId}/reactivate`).expect(200);
  });

  it('billing: aprovar zera as recusas e avança o ciclo', async () => {
    const seenIds = new Set((await prisma.saasInvoice.findMany({ where: { tenantId }, select: { id: true } })).map((i) => i.id));

    await prisma.tenantSubscription.updateMany({
      where: { tenantId },
      data: { currentPeriodEnd: new Date(Date.now() - 1000), failedAttempts: 2, status: 'ACTIVE' },
    });
    await asAdmin().post('/admin/billing/run-cycle').expect(201);

    const allInvoices = await prisma.saasInvoice.findMany({ where: { tenantId, status: 'PENDING' } });
    const invoice = allInvoices.find((row) => !seenIds.has(row.id));
    if (!invoice) {
      throw new Error('run-cycle não gerou fatura PENDING nova.');
    }
    await asAdmin().post(`/admin/billing/invoices/${invoice.id}/approve`).expect(201);

    const subscription = await prisma.tenantSubscription.findFirstOrThrow({ where: { tenantId } });
    expect(subscription.failedAttempts).toBe(0);
    expect(subscription.status).toBe('ACTIVE');
    expect(subscription.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
  });
});
