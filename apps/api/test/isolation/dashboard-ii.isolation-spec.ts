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
    ['/commissions/period?month=2026-08'],
    ['/commissions/period?type=WEEKLY&anchor=2026-08-17'],
    ['/commissions/period/report.pdf?month=2026-08&barberId=x'],
    ['/commissions/vales'],
    ['/loyalty/program'],
    ['/loyalty/plans'],
    ['/loyalty/subscribers'],
    ['/reports/advanced'],
    ['/reports/export.csv'],
    ['/reports/export.pdf'],
  ])('Essencial recebe 403 em %s', async (path) => {
    await get(essencial, path as string).expect(403);
  });

  /**
   * O gate do Financeiro cobre EXATAMENTE as 3 sub-abas que o protótipo tranca
   * (`LOCKED_FIN_TABS`). Caixa, Contas bancárias e Fluxo de caixa são de todo
   * plano — este caso existe para que ninguém os tranque "por simetria" outra
   * vez, que foi o desvio corrigido na auditoria do agente 18.
   */
  /**
   * `/reports/summary` serve os TRÊS blocos que o protótipo da aba Relatórios
   * deixa sem cadeado (faturamento por período, por barbeiro e por forma de
   * pagamento). Antes da auditoria do agente 20, "por barbeiro" vinha dentro do
   * endpoint gated e o Essencial via paywall onde o desenho mostra a tela.
   */
  it('Essencial ENXERGA /reports/summary COM faturamento por barbeiro', async () => {
    const response = await get(essencial, '/reports/summary').expect(200);
    expect(response.body).toHaveProperty('revenueByBarber');
    expect(response.body).toHaveProperty('paymentDistribution');
  });

  it.each([['/finance/cash-register'], ['/finance/bank-accounts'], ['/finance/cash-flow']])(
    'Essencial ENXERGA %s — não é sub-aba travada',
    async (path) => {
      await get(essencial, path as string).expect(200);
    },
  );

  it('Essencial recebe 403 ao ligar automação de WhatsApp além do básico', async () => {
    await api()
      .patch(url('/whatsapp-config/BIRTHDAY'))
      .set('Authorization', `Bearer ${essencial.token}`)
      .send({ enabled: true })
      .expect(403);
  });

  it.each([['/loyalty/plans'], ['/loyalty/subscribers']])(
    'Profissional recebe 403 em %s',
    async (path) => {
      await get(profissional, path as string).expect(403);
    },
  );

  /**
   * Agente 26 — o gate de `multiUnidades` mudou de lugar dentro de
   * `/settings/units`: a LEITURA é livre (a sub-aba mostra a lista e o cadeado
   * fica no botão "+ Nova unidade", como na topbar do protótipo) e as ESCRITAS
   * é que respondem 403. Sem estes dois casos, mover o gate teria aberto a
   * criação de unidade para todo mundo sem quebrar teste nenhum.
   */
  it('Profissional LÊ as unidades, mas não cria nem edita', async () => {
    await get(profissional, '/settings/units').expect(200);
    await api()
      .post(url('/settings/units'))
      .set('Authorization', `Bearer ${profissional.token}`)
      .send({ name: 'Unidade barrada' })
      .expect(403);
    await api()
      .patch(url('/settings/units/qualquer'))
      .set('Authorization', `Bearer ${profissional.token}`)
      .send({ name: 'Unidade barrada' })
      .expect(403);
  });

  /**
   * As rotas de ESCRITA da aba Fidelidade também são do Avançado. Sem estes
   * casos, um gate esquecido em `reactivate`/`pause`/`cancel` passaria batido:
   * a leitura estaria trancada e a escrita, aberta.
   */
  it('Profissional recebe 403 nas escritas de planos e assinantes', async () => {
    const authed = (path: string) =>
      api().patch(url(path)).set('Authorization', `Bearer ${profissional.token}`);

    await api()
      .post(url('/loyalty/plans'))
      .set('Authorization', `Bearer ${profissional.token}`)
      .send({ name: 'Plano barrado', priceCents: 1_000, items: [{ serviceId: 'x', quota: 1 }] })
      .expect(403);
    await authed('/loyalty/plans/qualquer/archive').expect(403);
    await authed('/loyalty/plans/qualquer/reactivate').expect(403);
    await authed('/loyalty/subscribers/qualquer/pause').expect(403);
    await authed('/loyalty/subscribers/qualquer/resume').expect(403);
    await authed('/loyalty/subscribers/qualquer/cancel').expect(403);
    await api()
      .delete(url('/loyalty/plans/qualquer'))
      .set('Authorization', `Bearer ${profissional.token}`)
      .expect(403);
  });

  // Agente 23 — a calculadora saiu de `/settings` para `/price-calculator`, e
  // o gate agora tranca a LEITURA também: no protótipo o cadeado está na aba,
  // não num botão de calcular.
  it('Profissional recebe 403 na calculadora de preço (GET e PUT)', async () => {
    await get(profissional, '/price-calculator').expect(403);
    await api()
      .put(url('/price-calculator'))
      .set('Authorization', `Bearer ${profissional.token}`)
      .send({
        fixedCosts: [{ name: 'Aluguel', amountCents: 100_000 }],
        custoVariavelCents: 500,
        comissaoMediaBps: 4_000,
        atendimentosMes: 300,
        margemBps: 2_000,
        precoPraticadoCents: 5_000,
      })
      .expect(403);
  });

  it('Avançado passa em tudo (contas a pagar, assinaturas, multi-unidades, calculadora)', async () => {
    await get(avancadoA, '/finance/payables').expect(200);
    await get(avancadoA, '/loyalty/plans').expect(200);
    await get(avancadoA, '/settings/units').expect(200);
    await get(avancadoA, '/price-calculator').expect(200);

    const saved = await api()
      .put(url('/price-calculator'))
      .set('Authorization', `Bearer ${avancadoA.token}`)
      .send({
        fixedCosts: [{ name: 'Aluguel', amountCents: 250_000 }],
        custoVariavelCents: 450,
        comissaoMediaBps: 4_500,
        atendimentosMes: 500,
        margemBps: 2_000,
        precoPraticadoCents: 4_500,
      })
      .expect(200);

    // O servidor devolve os derivados junto — a tela não recalcula sozinha o
    // que o banco acabou de gravar.
    expect(saved.body.result.custosFixosTotalCents).toBe(250_000);
    expect(saved.body.result.precoMinimoCents).toBeGreaterThan(0);
  });

  it('a calculadora de um tenant não vaza para o outro', async () => {
    const outro = await get(avancadoB, '/price-calculator').expect(200);
    expect(outro.body.fixedCosts).toHaveLength(0);
  });

  it('a calculadora recusa parâmetros fora da faixa dos sliders (400)', async () => {
    await api()
      .put(url('/price-calculator'))
      .set('Authorization', `Bearer ${avancadoA.token}`)
      .send({
        fixedCosts: [],
        custoVariavelCents: 0,
        comissaoMediaBps: 4_000,
        // O slider vai até 1200 (protótipo l.1897).
        atendimentosMes: 5_000,
        margemBps: 2_000,
        precoPraticadoCents: 4_500,
      })
      .expect(400);
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
