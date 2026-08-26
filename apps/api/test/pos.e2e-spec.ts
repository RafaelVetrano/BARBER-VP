import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { MembershipRole, OrderStatus, PaymentMethod, PrismaClient } from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Aba Comandas (agente 17) contra o banco real.
 *
 * O que a fase 07 já cobria — fechamento em transação única, reabertura,
 * estoque — segue em `dashboard-ii.e2e-spec.ts`. Aqui ficam os contratos que a
 * auditoria 1:1 criou: as contagens das abas, o recorte "fechadas hoje", o que
 * o card da comanda aberta mostra, a prévia do resgate de pontos e a troca de
 * cliente com reprecificação da assinatura.
 */
describe('comandas — auditoria da aba (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-pos-${run}`;
  const password = 'ComandasSenhaForte1';

  let tenantId: string;
  let ownerToken: string;
  let barberToken: string;
  let barberId: string;
  let otherBarberId: string;
  let serviceId: string;
  let productId: string;
  /** Cliente comum — sem assinatura, com saldo de pontos. */
  let clientId: string;
  /** Assinante do plano que cobre o serviço. */
  let subscriberId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${token}`),
  });
  const asOwner = () => as(ownerToken);
  const asBarber = () => as(barberToken);

  /** Abre uma comanda e já devolve o detalhe. */
  const openOrder = async (body: Record<string, unknown>) => {
    const response = await asOwner().post('/orders').send(body).expect(201);
    return response.body as { id: string; number: number };
  };

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
        code: `e2e-avancado-pos-${run}`,
        name: 'Avançado (e2e pos)',
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
        name: 'Barbearia Comandas (e2e)',
        timezone: 'America/Sao_Paulo',
        settings: { create: { allowOnlineBooking: true } },
        planId: saasPlan.id,
        loyaltyProgram: {
          create: { active: true, gastoPorPonto: 100, pontosParaDesconto: 100, valorDesconto: 1_000 },
        },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-pos-owner-${run}@barbervp.test`;
    const barberEmail = `e2e-pos-barber-${run}@barbervp.test`;

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dono POS',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });
    const barberUser = await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro POS',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
      select: { id: true },
    });

    const barber = await prisma.barber.create({
      data: { tenantId, userId: barberUser.id, name: 'Barbeiro POS' },
      select: { id: true },
    });
    barberId = barber.id;
    const otherBarber = await prisma.barber.create({
      data: { tenantId, name: 'Outro Barbeiro POS' },
      select: { id: true },
    });
    otherBarberId = otherBarber.id;

    const service = await prisma.service.create({
      data: { tenantId, name: 'Corte POS', durationMin: 30, priceCents: 5_000 },
      select: { id: true },
    });
    serviceId = service.id;

    const product = await prisma.product.create({
      data: { tenantId, name: 'Pomada POS', priceCents: 3_000, stock: 20, estoqueMin: 2 },
      select: { id: true },
    });
    productId = product.id;

    const client = await prisma.client.create({
      data: {
        phone: `9971${run}`,
        name: 'Cliente Comum POS',
        profiles: { create: { tenantId, phone: `9971${run}` } },
      },
      select: { id: true },
    });
    clientId = client.id;
    // Saldo suficiente para o resgate (pontosParaDesconto = 100).
    await prisma.loyaltyPoints.create({
      data: { tenantId, clientId, points: 250, kind: 'EARN', reason: 'Saldo de teste' },
    });

    const subscriber = await prisma.client.create({
      data: {
        phone: `9972${run}`,
        name: 'Assinante POS',
        profiles: { create: { tenantId, phone: `9972${run}` } },
      },
      select: { id: true },
    });
    subscriberId = subscriber.id;

    const plan = await prisma.clientPlan.create({
      data: {
        tenantId,
        name: 'Clube POS',
        priceCents: 9_900,
        items: { create: { tenantId, serviceId, quota: 4 } },
      },
      select: { id: true },
    });

    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const periodEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await prisma.clientSubscription.create({
      data: {
        tenantId,
        clientId: subscriberId,
        planId: plan.id,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        usages: { create: { tenantId, serviceId, periodStart, periodEnd, quota: 4, used: 0 } },
      },
    });

    ownerToken = (await api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200)).body
      .accessToken;
    barberToken = (await api().post(url('/auth/login')).send({ email: barberEmail, password }).expect(200))
      .body.accessToken;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.client.deleteMany({ where: { id: { in: [clientId, subscriberId] } } });
    await prisma.saasPlan.deleteMany({ where: { code: `e2e-avancado-pos-${run}` } });
    await prisma.$disconnect();
    await app.close();
  });

  it('o catálogo antecipa o número da próxima comanda', async () => {
    const before = await asOwner().get('/orders/catalog').expect(200);
    const opened = await openOrder({ clientId, barberId });

    expect(opened.number).toBe(before.body.nextNumber);

    const after = await asOwner().get('/orders/catalog').expect(200);
    expect(after.body.nextNumber).toBe(opened.number + 1);
  });

  it('o card da comanda aberta traz subtotal e o resumo dos itens', async () => {
    const order = await openOrder({ clientId, barberId });
    await asOwner()
      .post(`/orders/${order.id}/items`)
      .send({ kind: 'PRODUCT', productId, quantity: 2 })
      .expect(201);

    const list = await asOwner().get('/orders?status=OPEN&search=Cliente Comum POS').expect(200);
    const row = list.body.data.find((item: { id: string }) => item.id === order.id);

    expect(row.subtotalCents).toBe(6_000);
    expect(row.lines).toEqual([{ description: 'Pomada POS', quantity: 2, unitPriceCents: 3_000 }]);
  });

  it('a busca acha pelo número da comanda, com ou sem "#"', async () => {
    const order = await openOrder({ clientId, barberId });

    for (const term of [String(order.number), `#${order.number}`]) {
      const found = await asOwner().get(`/orders?search=${encodeURIComponent(term)}`).expect(200);
      expect(found.body.data.some((row: { id: string }) => row.id === order.id)).toBe(true);
    }
  });

  it('as contagens das abas ignoram a aba escolhida e respeitam a busca', async () => {
    const mine = await openOrder({ clientId, barberId });
    await asOwner().post(`/orders/${mine.id}/items`).send({ kind: 'SERVICE', serviceId }).expect(201);

    // Comanda de OUTRO cliente, para a busca ter o que descartar.
    const other = await openOrder({ walkIn: { name: 'Fulano Avulso POS', phone: '11999990000' } });
    await asOwner().post(`/orders/${other.id}/items`).send({ kind: 'SERVICE', serviceId }).expect(201);
    await asOwner()
      .post(`/orders/${other.id}/close`)
      .send({ payments: [{ method: PaymentMethod.PIX, amountCents: 5_000 }] })
      .expect(201);

    // Pedindo só as abertas, a contagem de fechadas continua vindo preenchida.
    const opened = await asOwner().get('/orders?status=OPEN').expect(200);
    expect(opened.body.counts.abertas).toBeGreaterThan(0);
    expect(opened.body.counts.fechadasHoje).toBeGreaterThan(0);

    // Com busca, as duas contagens caem para o recorte da busca.
    const searched = await asOwner().get('/orders?status=OPEN&search=Fulano Avulso POS').expect(200);
    expect(searched.body.counts.abertas).toBe(0);
    expect(searched.body.counts.fechadasHoje).toBe(1);
  });

  it('"fechadas hoje" exclui o que foi fechado ontem', async () => {
    const order = await openOrder({ clientId, barberId });
    await asOwner().post(`/orders/${order.id}/items`).send({ kind: 'SERVICE', serviceId }).expect(201);
    await asOwner()
      .post(`/orders/${order.id}/close`)
      .send({ payments: [{ method: PaymentMethod.CASH, amountCents: 5_000 }] })
      .expect(201);

    const hoje = await asOwner().get('/orders?status=CLOSED&closedToday=true').expect(200);
    expect(hoje.body.data.some((row: { id: string }) => row.id === order.id)).toBe(true);

    // Empurra o fechamento para 30 horas atrás — ontem em qualquer fuso.
    await prisma.order.update({
      where: { id: order.id },
      data: { closedAt: new Date(Date.now() - 30 * 60 * 60 * 1000) },
    });

    const ainda = await asOwner().get('/orders?status=CLOSED&closedToday=true').expect(200);
    expect(ainda.body.data.some((row: { id: string }) => row.id === order.id)).toBe(false);

    // Sem o recorte, ela continua na lista de fechadas.
    const todas = await asOwner().get('/orders?status=CLOSED').expect(200);
    expect(todas.body.data.some((row: { id: string }) => row.id === order.id)).toBe(true);
  });

  it('o detalhe entrega a prévia do resgate; walk-in não pontua', async () => {
    const comCliente = await openOrder({ clientId, barberId });
    const detail = await asOwner().get(`/orders/${comCliente.id}`).expect(200);

    expect(detail.body.loyaltyEnabled).toBe(true);
    expect(detail.body.loyaltyPointsRequired).toBe(100);
    expect(detail.body.loyaltyRewardCents).toBe(1_000);
    // Pelo menos o saldo plantado — os fechamentos dos casos anteriores deste
    // arquivo creditam pontos ao mesmo cliente.
    expect(detail.body.loyaltyBalance).toBeGreaterThanOrEqual(250);
    // A prévia existe ANTES de ligar o resgate — é ela que o card mostra.
    expect(detail.body.useLoyalty).toBe(false);
    expect(detail.body.loyaltyDiscountCents).toBe(0);

    const avulsa = await openOrder({ walkIn: { name: 'Sem Cadastro POS', phone: '11988887777' } });
    const semCliente = await asOwner().get(`/orders/${avulsa.id}`).expect(200);
    expect(semCliente.body.loyaltyEnabled).toBe(false);
    expect(semCliente.body.loyaltyBalance).toBe(0);
  });

  describe('PATCH /orders/:id — trocar cliente e barbeiro', () => {
    it('reprecifica o serviço quando o novo cliente não tem a assinatura', async () => {
      const order = await openOrder({ clientId: subscriberId, barberId });
      const added = await asOwner()
        .post(`/orders/${order.id}/items`)
        .send({ kind: 'SERVICE', serviceId })
        .expect(201);

      // Assinante: o serviço entra a R$ 0.
      expect(added.body.items[0].coveredBySubscription).toBe(true);
      expect(added.body.totalCents).toBe(0);

      const trocado = await asOwner().patch(`/orders/${order.id}`).send({ clientId }).expect(200);

      expect(trocado.body.clientId).toBe(clientId);
      expect(trocado.body.items[0].coveredBySubscription).toBe(false);
      expect(trocado.body.items[0].unitPriceCents).toBe(5_000);
      expect(trocado.body.totalCents).toBe(5_000);
    });

    it('cobre o serviço ao trocar para quem TEM a assinatura, e derruba o resgate de pontos', async () => {
      const order = await openOrder({ clientId, barberId });
      await asOwner().post(`/orders/${order.id}/items`).send({ kind: 'SERVICE', serviceId }).expect(201);

      const comResgate = await asOwner()
        .patch(`/orders/${order.id}/loyalty`)
        .send({ useLoyalty: true })
        .expect(200);
      expect(comResgate.body.useLoyalty).toBe(true);
      expect(comResgate.body.loyaltyDiscountCents).toBe(1_000);

      const trocado = await asOwner().patch(`/orders/${order.id}`).send({ clientId: subscriberId }).expect(200);

      expect(trocado.body.items[0].coveredBySubscription).toBe(true);
      // O saldo era do cliente que saiu.
      expect(trocado.body.useLoyalty).toBe(false);
      expect(trocado.body.loyaltyDiscountCents).toBe(0);
      expect(trocado.body.totalCents).toBe(0);
    });

    it('troca o barbeiro e recusa barbeiro de fora', async () => {
      const order = await openOrder({ clientId, barberId });

      const trocado = await asOwner()
        .patch(`/orders/${order.id}`)
        .send({ barberId: otherBarberId })
        .expect(200);
      expect(trocado.body.barberId).toBe(otherBarberId);

      await asOwner().patch(`/orders/${order.id}`).send({ barberId: 'nao-existe' }).expect(404);
    });

    it('não mexe em comanda já fechada', async () => {
      const order = await openOrder({ clientId, barberId });
      await asOwner().post(`/orders/${order.id}/items`).send({ kind: 'SERVICE', serviceId }).expect(201);
      await asOwner()
        .post(`/orders/${order.id}/close`)
        .send({ payments: [{ method: PaymentMethod.PIX, amountCents: 5_000 }] })
        .expect(201);

      await asOwner().patch(`/orders/${order.id}`).send({ clientId: subscriberId }).expect(409);
    });
  });

  it('BARBER só enxerga e só troca as próprias comandas', async () => {
    const alheia = await openOrder({ clientId, barberId: otherBarberId });
    const propria = await openOrder({ clientId, barberId });

    const lista = await asBarber().get('/orders?status=OPEN').expect(200);
    const ids = lista.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(propria.id);
    expect(ids).not.toContain(alheia.id);

    await asBarber().get(`/orders/${alheia.id}`).expect(403);
    await asBarber().patch(`/orders/${alheia.id}`).send({ clientId: subscriberId }).expect(403);
    // E não pode empurrar a própria comanda para outro barbeiro.
    await asBarber().patch(`/orders/${propria.id}`).send({ barberId: otherBarberId }).expect(403);
  });

  it('reabrir continua sendo de MANAGER+', async () => {
    const order = await openOrder({ clientId, barberId });
    await asOwner().post(`/orders/${order.id}/items`).send({ kind: 'SERVICE', serviceId }).expect(201);
    await asOwner()
      .post(`/orders/${order.id}/close`)
      .send({ payments: [{ method: PaymentMethod.PIX, amountCents: 5_000 }] })
      .expect(201);

    await asBarber().post(`/orders/${order.id}/reopen`).send({ reason: 'tentativa' }).expect(403);

    const reaberta = await asOwner()
      .post(`/orders/${order.id}/reopen`)
      .send({ reason: 'cliente esqueceu um produto' })
      .expect(201);
    expect(reaberta.body.status).toBe(OrderStatus.OPEN);
  });
});
