import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import {
  AppointmentStatus,
  CommissionRuleType,
  MembershipRole,
  PrismaClient,
} from '@prisma/client';
import {
  PlanTier,
  SERVICE_COLORS,
  computePriceCalculator,
  featuresForTier,
} from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Aba **Serviços & Produtos** (fase 23) de ponta a ponta.
 *
 * O que estes casos protegem, em ordem de importância:
 *  1. **as colunas que o protótipo desenha existem no dado** — cor, comissão
 *     efetiva e margem saíam da tela porque não saíam do banco;
 *  2. **"Excluir" preserva o histórico** — o soft-delete tira do catálogo sem
 *     apagar a comanda fechada nem o agendamento passado, e recusa quando o
 *     estrago seria real (agendamento futuro, estoque em prateleira);
 *  3. **a comissão específica do serviço chega no dinheiro** — o override
 *     vence a regra do barbeiro no fechamento da comanda;
 *  4. **a calculadora é gate de plano E persiste** — e a conta gravada é a
 *     mesma que o front mostra (`computePriceCalculator`).
 */
describe('aba Serviços & Produtos — catálogo, estoque e calculadora (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-cat-${run}`;
  const slugEssencial = `e2e-cat-ess-${run}`;
  const password = 'CatalogoSenhaForte1';

  let tenantId: string;
  let ownerToken: string;
  let barberToken: string;
  let essencialToken: string;
  let barberId: string;
  let clientId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${token}`),
    put: (path: string) => api().put(url(path)).set('Authorization', `Bearer ${token}`),
    delete: (path: string) => api().delete(url(path)).set('Authorization', `Bearer ${token}`),
  });
  const asOwner = () => as(ownerToken);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const [avancado, essencial] = await Promise.all([
      prisma.saasPlan.create({
        data: {
          code: `e2e-cat-avancado-${run}`,
          name: 'Avançado (e2e cat)',
          priceCents: 13_900,
          tier: PlanTier.AVANCADO,
          maxBarbers: null,
          features: featuresForTier(PlanTier.AVANCADO) as unknown as object,
        },
        select: { id: true },
      }),
      prisma.saasPlan.create({
        data: {
          code: `e2e-cat-essencial-${run}`,
          name: 'Essencial (e2e cat)',
          priceCents: 4_900,
          tier: PlanTier.ESSENCIAL,
          maxBarbers: 2,
          features: featuresForTier(PlanTier.ESSENCIAL) as unknown as object,
        },
        select: { id: true },
      }),
    ]);

    const tenant = await prisma.tenant.create({
      data: { slug, name: 'Barbearia Catálogo (e2e)', planId: avancado.id },
      select: { id: true },
    });
    tenantId = tenant.id;

    const tenantEssencial = await prisma.tenant.create({
      data: { slug: slugEssencial, name: 'Barbearia Essencial (e2e cat)', planId: essencial.id },
      select: { id: true },
    });

    // Regra de comissão FIXED em 40% — é o "Comissão padrão" que a coluna do
    // catálogo herda quando o serviço não tem percentual próprio.
    const rule = await prisma.commissionRule.create({
      data: {
        tenantId,
        name: 'Regra padrão (e2e cat)',
        type: CommissionRuleType.FIXED,
        percentBps: 4_000,
      },
      select: { id: true },
    });

    const barber = await prisma.barber.create({
      data: { tenantId, name: 'Barbeiro Catálogo', commissionRuleId: rule.id },
      select: { id: true },
    });
    barberId = barber.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-cat-owner-${run}@barbervp.test`;
    const barberEmail = `e2e-cat-barber-${run}@barbervp.test`;
    const essencialEmail = `e2e-cat-ess-${run}@barbervp.test`;

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dona Catálogo',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });
    await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro Catálogo',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
    });
    await prisma.user.create({
      data: {
        email: essencialEmail,
        name: 'Dono Essencial',
        passwordHash,
        memberships: { create: { tenantId: tenantEssencial.id, role: MembershipRole.OWNER } },
      },
    });

    const client = await prisma.client.create({
      data: {
        phone: `5511903${run}`,
        name: 'Cliente Catálogo',
        profiles: { create: { tenantId, phone: `5511903${run}` } },
      },
      select: { id: true },
    });
    clientId = client.id;

    const login = async (email: string) => {
      const response = await api().post(url('/auth/login')).send({ email, password }).expect(200);
      return response.body.accessToken as string;
    };
    ownerToken = await login(ownerEmail);
    barberToken = await login(barberEmail);
    essencialToken = await login(essencialEmail);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, slugEssencial] } } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.saasPlan.deleteMany({
      where: { code: { in: [`e2e-cat-avancado-${run}`, `e2e-cat-essencial-${run}`] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Serviços ────────────────────────────────────────────────────────────

  describe('serviços', () => {
    it('a lista abre num tenant sem serviço nenhum, com o padrão de comissão da casa', async () => {
      const response = await asOwner().get('/services?perPage=100').expect(200);

      expect(response.body.data).toEqual([]);
      // O modal precisa deste número para dizer o que o serviço herda; sem
      // ele a tela mostraria "0%" numa barbearia que paga 40%.
      expect(response.body.defaultCommissionBps).toBe(4_000);
    });

    it('criar guarda cor e barbeiros, e a linha já volta com a comissão efetiva', async () => {
      const created = await asOwner()
        .post('/services')
        .send({
          name: 'Corte Auditoria',
          durationMin: 45,
          priceCents: 5_000,
          color: SERVICE_COLORS[1],
          barberIds: [barberId],
        })
        .expect(201);

      expect(created.body.color).toBe(SERVICE_COLORS[1]);
      expect(created.body.barberIds).toEqual([barberId]);
      expect(created.body.commissionBps).toBeNull();
      expect(created.body.effectiveCommissionBps).toBe(4_000);
    });

    it('cor fora das 6 do design system é recusada (400)', async () => {
      await asOwner()
        .post('/services')
        .send({
          name: `Serviço cor inválida ${run}`,
          durationMin: 30,
          priceCents: 3_000,
          color: '#000000',
        })
        .expect(400);
    });

    it('comissão específica acima de 100% é recusada (400)', async () => {
      await asOwner()
        .post('/services')
        .send({
          name: `Serviço comissão absurda ${run}`,
          durationMin: 30,
          priceCents: 3_000,
          commissionBps: 15_000,
        })
        .expect(400);
    });

    it('ligar a comissão específica muda a comissão efetiva da linha', async () => {
      const created = await asOwner()
        .post('/services')
        .send({ name: `Serviço com comissão própria ${run}`, durationMin: 30, priceCents: 4_000 })
        .expect(201);

      expect(created.body.effectiveCommissionBps).toBe(4_000);

      const updated = await asOwner()
        .patch(`/services/${created.body.id}`)
        .send({
          name: created.body.name,
          durationMin: 30,
          priceCents: 4_000,
          commissionBps: 6_000,
        })
        .expect(200);

      expect(updated.body.commissionBps).toBe(6_000);
      expect(updated.body.effectiveCommissionBps).toBe(6_000);
    });

    it('excluir tira do catálogo e do booking, mas não some com o agendamento passado', async () => {
      const created = await asOwner()
        .post('/services')
        .send({ name: `Serviço a excluir ${run}`, durationMin: 30, priceCents: 3_000 })
        .expect(201);

      const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
      const appointment = await prisma.appointment.create({
        data: {
          tenantId,
          barberId,
          clientId,
          serviceId: created.body.id,
          startsAt: past,
          endsAt: new Date(past.getTime() + 30 * 60_000),
          status: AppointmentStatus.DONE,
          priceCents: 3_000,
          bookingCode: `E2ECAT${run}A`,
        },
        select: { id: true },
      });

      await asOwner().delete(`/services/${created.body.id}`).expect(204);

      const list = await asOwner().get('/services?perPage=100').expect(200);
      expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(created.body.id);

      // O histórico continua apontando para o serviço — soft-delete, não DELETE.
      const kept = await prisma.appointment.findUnique({
        where: { id: appointment.id },
        select: { serviceId: true },
      });
      expect(kept?.serviceId).toBe(created.body.id);
    });

    it('excluir um serviço com agendamento FUTURO é recusado (409), com a saída no texto', async () => {
      const created = await asOwner()
        .post('/services')
        .send({ name: `Serviço ocupado ${run}`, durationMin: 30, priceCents: 3_000 })
        .expect(201);

      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000);
      await prisma.appointment.create({
        data: {
          tenantId,
          barberId,
          clientId,
          serviceId: created.body.id,
          startsAt: future,
          endsAt: new Date(future.getTime() + 30 * 60_000),
          status: AppointmentStatus.CONFIRMED,
          priceCents: 3_000,
          bookingCode: `E2ECAT${run}B`,
        },
      });

      const response = await asOwner().delete(`/services/${created.body.id}`).expect(409);
      expect(response.body.message).toContain('desative o serviço');
    });

    it('o nome liberado depois da exclusão pode ser recadastrado', async () => {
      const name = `Serviço reciclado ${run}`;
      const created = await asOwner()
        .post('/services')
        .send({ name, durationMin: 30, priceCents: 3_000 })
        .expect(201);

      await asOwner().delete(`/services/${created.body.id}`).expect(204);
      await asOwner().post('/services').send({ name, durationMin: 30, priceCents: 3_000 }).expect(201);
    });
  });

  // ── Produtos ────────────────────────────────────────────────────────────

  describe('produtos', () => {
    it('a linha traz margem e o selo de repor conforme o estoque mínimo', async () => {
      const created = await asOwner()
        .post('/products')
        .send({
          name: `Pomada Auditoria ${run}`,
          priceCents: 4_000,
          costCents: 2_000,
          stock: 3,
          estoqueMin: 5,
        })
        .expect(201);

      // (4000 - 2000) / 2000 = 100%.
      expect(created.body.marginBps).toBe(10_000);
      expect(created.body.lowStock).toBe(true);
    });

    it('produto sem custo tem margem `null` em vez de Infinity', async () => {
      const created = await asOwner()
        .post('/products')
        .send({ name: `Sem custo ${run}`, priceCents: 3_000, stock: 10, estoqueMin: 2 })
        .expect(201);

      expect(created.body.marginBps).toBeNull();
    });

    it('repor SOMA ao saldo e apaga o selo de repor', async () => {
      const created = await asOwner()
        .post('/products')
        .send({ name: `A repor ${run}`, priceCents: 3_000, costCents: 1_000, stock: 2, estoqueMin: 5 })
        .expect(201);
      expect(created.body.lowStock).toBe(true);

      const restocked = await asOwner()
        .post(`/products/${created.body.id}/restock`)
        .send({ quantity: 8 })
        .expect(201);

      expect(restocked.body.stock).toBe(10);
      expect(restocked.body.lowStock).toBe(false);
    });

    it('repor com quantidade zero ou negativa é recusado (400)', async () => {
      const created = await asOwner()
        .post('/products')
        .send({ name: `Reposição inválida ${run}`, priceCents: 3_000, stock: 1, estoqueMin: 1 })
        .expect(201);

      await asOwner().post(`/products/${created.body.id}/restock`).send({ quantity: 0 }).expect(400);
      await asOwner().post(`/products/${created.body.id}/restock`).send({ quantity: -5 }).expect(400);
    });

    it('excluir produto COM estoque é recusado (409); zerado, passa', async () => {
      const created = await asOwner()
        .post('/products')
        .send({ name: `Com estoque ${run}`, priceCents: 3_000, stock: 4, estoqueMin: 1 })
        .expect(201);

      const denied = await asOwner().delete(`/products/${created.body.id}`).expect(409);
      expect(denied.body.message).toContain('4 unidade');

      await asOwner()
        .patch(`/products/${created.body.id}`)
        .send({ name: created.body.name, priceCents: 3_000, stock: 0, estoqueMin: 1 })
        .expect(200);

      await asOwner().delete(`/products/${created.body.id}`).expect(204);

      const list = await asOwner().get('/products?perPage=100').expect(200);
      expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(created.body.id);
    });

    it('o alerta de estoque baixo do sino conta os MESMOS produtos que mostram o selo', async () => {
      const list = await asOwner().get('/products?perPage=100&lowStock=true').expect(200);
      const lowFromList = list.body.data.filter((row: { active: boolean }) => row.active).length;

      const feed = await asOwner().get('/notifications').expect(200);
      const alert = feed.body.items.find((item: { kind: string }) => item.kind === 'LOW_STOCK');

      if (lowFromList === 0) {
        expect(alert).toBeUndefined();
      } else {
        expect(alert).toBeDefined();
        expect(alert.text).toContain(String(lowFromList));
        // O sino leva à sub-aba de PRODUTOS, não à de serviços.
        expect(alert.href).toContain('tab=produtos');
      }
    });
  });

  // ── Comissão específica no dinheiro ─────────────────────────────────────

  it('a comissão específica do serviço vence a regra do barbeiro no fechamento', async () => {
    const service = await asOwner()
      .post('/services')
      .send({
        name: `Serviço 70% ${run}`,
        durationMin: 30,
        priceCents: 10_000,
        commissionBps: 7_000,
        barberIds: [barberId],
      })
      .expect(201);

    const order = await asOwner()
      .post('/orders')
      .send({ clientId, barberId })
      .expect(201);

    await asOwner()
      .post(`/orders/${order.body.id}/items`)
      .send({ kind: 'SERVICE', serviceId: service.body.id, quantity: 1 })
      .expect(201);

    await asOwner()
      .post(`/orders/${order.body.id}/close`)
      .send({ payments: [{ method: 'CASH', amountCents: 10_000 }] })
      .expect(201);

    const entry = await prisma.commissionEntry.findFirst({
      where: { tenantId, orderId: order.body.id },
      select: { percentBps: true, amountCents: true },
    });

    // 70% do serviço, e não os 40% da regra do barbeiro.
    expect(entry?.percentBps).toBe(7_000);
    expect(entry?.amountCents).toBe(7_000);
  });

  // ── Calculadora de preço ────────────────────────────────────────────────

  describe('calculadora de preço', () => {
    it('o Essencial toma 403 na leitura e na gravação — o gate não é só do botão', async () => {
      await as(essencialToken).get('/price-calculator').expect(403);
      await as(essencialToken)
        .put('/price-calculator')
        .send({
          fixedCosts: [],
          custoVariavelCents: 0,
          comissaoMediaBps: 0,
          atendimentosMes: 300,
          margemBps: 2_000,
          precoPraticadoCents: 4_000,
        })
        .expect(403);
    });

    it('o primeiro acesso vem em branco de custos, mas com parâmetros tirados do tenant', async () => {
      const response = await asOwner().get('/price-calculator').expect(200);

      expect(response.body.fixedCosts).toEqual([]);
      // 40% é a regra REAL da barbearia — não os 45% que o protótipo cravava.
      expect(response.body.comissaoMediaBps).toBe(4_000);
      expect(response.body.precoPraticadoCents).toBeGreaterThan(0);
    });

    it('grava a lista de custos e devolve os derivados; a conta bate com a do front', async () => {
      const payload = {
        fixedCosts: [
          { name: 'Aluguel', amountCents: 250_000 },
          { name: 'Energia', amountCents: 45_000 },
        ],
        custoVariavelCents: 450,
        comissaoMediaBps: 4_500,
        atendimentosMes: 480,
        margemBps: 2_000,
        precoPraticadoCents: 4_500,
      };

      const saved = await asOwner().put('/price-calculator').send(payload).expect(200);

      expect(saved.body.fixedCosts).toHaveLength(2);
      expect(saved.body.result.custosFixosTotalCents).toBe(295_000);

      // Mesma função pura que a página roda a cada movimento do slider.
      const expected = computePriceCalculator({
        ...payload,
        fixedCosts: payload.fixedCosts.map((cost, index) => ({ id: String(index), ...cost })),
      });
      expect(saved.body.result).toEqual(expected);

      const reread = await asOwner().get('/price-calculator').expect(200);
      expect(reread.body.result).toEqual(expected);
    });

    it('gravar de novo SUBSTITUI a lista — remover uma linha some com ela', async () => {
      await asOwner()
        .put('/price-calculator')
        .send({
          fixedCosts: [{ name: 'Aluguel', amountCents: 250_000 }],
          custoVariavelCents: 450,
          comissaoMediaBps: 4_500,
          atendimentosMes: 480,
          margemBps: 2_000,
          precoPraticadoCents: 4_500,
        })
        .expect(200);

      const reread = await asOwner().get('/price-calculator').expect(200);
      expect(reread.body.fixedCosts).toHaveLength(1);
    });

    it('preço praticado que não paga a comissão não inventa ponto de equilíbrio', async () => {
      const saved = await asOwner()
        .put('/price-calculator')
        .send({
          fixedCosts: [{ name: 'Aluguel', amountCents: 250_000 }],
          custoVariavelCents: 5_000,
          comissaoMediaBps: 5_000,
          atendimentosMes: 480,
          // R$ 20 com 50% de comissão deixa R$ 10, menos R$ 50 de insumo.
          precoPraticadoCents: 2_000,
          margemBps: 2_000,
        })
        .expect(200);

      expect(saved.body.result.pontoEquilibrio).toBeNull();
      expect(saved.body.result.lucroLiquidoCents).toBeLessThan(0);
    });
  });

  // ── Papel ───────────────────────────────────────────────────────────────

  it('BARBER não vê nem mexe em nada desta aba', async () => {
    await as(barberToken).get('/services').expect(403);
    await as(barberToken).get('/products').expect(403);
    await as(barberToken).get('/price-calculator').expect(403);
  });
});
