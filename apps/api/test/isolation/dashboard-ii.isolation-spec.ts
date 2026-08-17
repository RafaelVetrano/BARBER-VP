import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CONFIG, type AppConfig } from '../../src/config/configuration';

/**
 * Isolamento de fase 07 — dois ângulos:
 *   1. Feature flags por plano: Essencial toma 403 em contas a pagar/receber,
 *      comissões, fidelidade (pontos) e relatórios avançados; Profissional
 *      toma 403 em assinaturas/multi-unidades/calculadora de preço.
 *   2. Tenant: uma comanda de A nunca aparece na listagem de B.
 */
describe('isolamento — feature flags e tenant (fase 07)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const password = 'IsolamentoD2Senha1';

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  interface TenantHandle {
    id: string;
    token: string;
  }

  let essencial: TenantHandle;
  let profissional: TenantHandle;
  let avancadoA: TenantHandle;
  let avancadoB: TenantHandle;
  const cleanupSlugs: string[] = [];
  const cleanupPlanCodes: string[] = [];

  async function makeTenant(label: string, tier: PlanTier): Promise<TenantHandle> {
    const code = `e2e-iso-d2-${label}-${run}`;
    const slug = `iso-d2-${label}-${run}`;
    cleanupSlugs.push(slug);
    cleanupPlanCodes.push(code);

    const plan = await prisma.saasPlan.create({
      data: {
        code,
        name: `${label} (iso e2e)`,
        priceCents: 1_000,
        tier,
        maxBarbers: tier === PlanTier.ESSENCIAL ? 2 : tier === PlanTier.PROFISSIONAL ? 4 : null,
        features: featuresForTier(tier) as unknown as object,
      },
      select: { id: true },
    });

    const tenant = await prisma.tenant.create({
      data: { slug, name: `Tenant ${label}`, planId: plan.id, settings: { create: {} } },
      select: { id: true },
    });

    const email = `iso-d2-owner-${label}-${run}@barbervp.test`;
    await prisma.user.create({
      data: {
        email,
        name: `Dono ${label}`,
        passwordHash: await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
        memberships: { create: { tenantId: tenant.id, role: MembershipRole.OWNER } },
      },
    });

    const login = await api().post(url('/auth/login')).send({ email, password }).expect(200);
    return { id: tenant.id, token: login.body.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    essencial = await makeTenant('essencial', PlanTier.ESSENCIAL);
    profissional = await makeTenant('profissional', PlanTier.PROFISSIONAL);
    avancadoA = await makeTenant('avancado-a', PlanTier.AVANCADO);
    avancadoB = await makeTenant('avancado-b', PlanTier.AVANCADO);
  });

  afterAll(async () => {
    for (const slug of cleanupSlugs) {
      await prisma.tenant.deleteMany({ where: { slug } });
    }
    for (const code of cleanupPlanCodes) {
      await prisma.saasPlan.deleteMany({ where: { code } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  const get = (tenant: TenantHandle, path: string) =>
    api().get(url(path)).set('Authorization', `Bearer ${tenant.token}`);

  it.each([
    ['/finance/payables'],
    ['/finance/receivables'],
    ['/finance/bank-accounts'],
    ['/finance/cash-flow'],
    ['/commissions/period?month=2026-08'],
    ['/commissions/vales'],
    ['/loyalty/program'],
    ['/loyalty/raffles'],
    ['/reports/advanced'],
  ])('Essencial recebe 403 em %s', async (path) => {
    await get(essencial, path as string).expect(403);
  });

  it('Essencial recebe 403 ao ligar automação de WhatsApp além do básico', async () => {
    await api()
      .patch(url('/whatsapp-config/BIRTHDAY'))
      .set('Authorization', `Bearer ${essencial.token}`)
      .send({ enabled: true })
      .expect(403);
  });

  it.each([['/loyalty/plans'], ['/loyalty/subscribers'], ['/settings/units']])(
    'Profissional recebe 403 em %s',
    async (path) => {
      await get(profissional, path as string).expect(403);
    },
  );

  it('Profissional recebe 403 na calculadora de preço', async () => {
    await api()
      .post(url('/settings/price-calculator'))
      .set('Authorization', `Bearer ${profissional.token}`)
      .send({ custoCents: 1_000, margemPercent: 20, custosFixosCents: 50_000, atendimentosMes: 100, comissaoPercent: 40 })
      .expect(403);
  });

  it('Avançado passa em tudo (contas a pagar, assinaturas, multi-unidades, calculadora)', async () => {
    await get(avancadoA, '/finance/payables').expect(200);
    await get(avancadoA, '/loyalty/plans').expect(200);
    await get(avancadoA, '/settings/units').expect(200);
    await api()
      .post(url('/settings/price-calculator'))
      .set('Authorization', `Bearer ${avancadoA.token}`)
      .send({ custoCents: 1_000, margemPercent: 20, custosFixosCents: 50_000, atendimentosMes: 100, comissaoPercent: 40 })
      .expect(201);
  });

  it('uma comanda do tenant A nunca aparece na listagem do tenant B', async () => {
    const barber = await prisma.barber.create({
      data: { tenantId: avancadoA.id, name: 'Barbeiro A' },
      select: { id: true },
    });

    const opened = await api()
      .post(url('/orders'))
      .set('Authorization', `Bearer ${avancadoA.token}`)
      .send({ walkIn: { name: 'Cliente Isolamento', phone: '5511900000000' }, barberId: barber.id })
      .expect(201);

    expect(opened.body.clientName).toBe('Cliente Isolamento');

    const listB = await get(avancadoB, '/orders').expect(200);
    expect(listB.body.data.find((row: { id: string }) => row.id === opened.body.id)).toBeUndefined();

    const detailFromB = await get(avancadoB, `/orders/${opened.body.id}`);
    expect(detailFromB.status).toBe(404);
  });
});
