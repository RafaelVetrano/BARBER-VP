import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import {
  LoyaltyPointsKind,
  MembershipRole,
  OrderItemKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import { CLIENT_INACTIVE_DAYS, PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Agente 16 — a aba Clientes de ponta a ponta.
 *
 * O que estes casos protegem, e por que:
 *
 * 1. **Status é derivado, e a derivação é uma só.** Os chips filtram no banco
 *    e a coluna pinta na tela; se as duas regras divergirem, o chip "Ativos"
 *    passa a listar gente marcada como "Inativo".
 * 2. **As contagens são disjuntas.** Elas somam exatamente o total — o
 *    protótipo cravava números que não fechavam (412 ≠ 361+38+24+13).
 * 3. **A busca e o filtro são do servidor.** Página de 20 com base de
 *    centenas: filtrar o array da página devolveria resultado errado.
 * 4. **O drawer sai do dado.** Ticket médio, histórico, extrato de pontos e
 *    uso da assinatura vêm das mesmas tabelas que comanda e fidelidade
 *    escrevem.
 * 5. **Lote respeita quem recusou mensagem** e nunca conta o que não mudou.
 */
describe('aba Clientes (agente 16, e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-cl16-${run}`;
  const planCode = `e2e-cl16-${run}`;
  const password = 'ClientesDezesseis1';

  let tenantId: string;
  let ownerToken: string;
  let barberId: string;
  let serviceId: string;

  /** Ids globais de `Client`, para a limpeza do final. */
  const clientIds: string[] = [];
  /** `ClientProfile` por apelido do cenário. */
  const profile: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const asOwner = () => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${ownerToken}`),
  });

  /** Cria `Client` + `ClientProfile` deste tenant e guarda os dois ids. */
  const seedClient = async (
    key: string,
    name: string,
    data: {
      lastVisitAt?: Date | null;
      visitCount?: number;
      totalSpentCents?: number;
      noShowCount?: number;
      blocked?: boolean;
      notifyWhatsapp?: boolean;
    } = {},
  ): Promise<string> => {
    const phone = `55${run}${String(clientIds.length).padStart(3, '0')}`;
    const client = await prisma.client.create({
      data: {
        phone,
        name,
        notifyWhatsapp: data.notifyWhatsapp ?? true,
        profiles: {
          create: {
            tenantId,
            phone,
            lastVisitAt: data.lastVisitAt ?? null,
            visitCount: data.visitCount ?? 0,
            totalSpentCents: data.totalSpentCents ?? 0,
            noShowCount: data.noShowCount ?? 0,
            blocked: data.blocked ?? false,
            // Nasce velho: sem isso, "sem visita nenhuma" contaria como novo.
            createdAt: new Date(Date.now() - 365 * DAY_MS),
          },
        },
      },
      select: { id: true, profiles: { select: { id: true } } },
    });
    clientIds.push(client.id);
    profile[key] = client.profiles[0]!.id;
    return client.id;
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const plan = await prisma.saasPlan.create({
      data: {
        code: planCode,
        name: 'Avançado (e2e cl16)',
        priceCents: 13_900,
        tier: PlanTier.AVANCADO,
        maxBarbers: null,
        features: featuresForTier(PlanTier.AVANCADO) as unknown as object,
      },
      select: { id: true },
    });

    const tenant = await prisma.tenant.create({
      data: { slug, name: 'Barbearia CL16 (e2e)', planId: plan.id, settings: { create: {} } },
      select: { id: true },
    });
    tenantId = tenant.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-cl16-owner-${run}@barbervp.test`;
    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dono CL16',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });

    const barber = await prisma.barber.create({
      data: { tenantId, name: 'Barbeiro CL16' },
      select: { id: true },
    });
    barberId = barber.id;

    const service = await prisma.service.create({
      data: { tenantId, name: 'Corte CL16', durationMin: 30, priceCents: 5_000 },
      select: { id: true },
    });
    serviceId = service.id;

    // ── Cenário: um cliente por status ────────────────────────────────────
    const recent = new Date(Date.now() - 2 * DAY_MS);
    const stale = new Date(Date.now() - (CLIENT_INACTIVE_DAYS + 10) * DAY_MS);

    await seedClient('ativo', 'Ana Ativa CL16', {
      lastVisitAt: recent,
      visitCount: 4,
      totalSpentCents: 20_000,
      noShowCount: 1,
    });
    await seedClient('inativo', 'Ivo Inativo CL16', { lastVisitAt: stale, visitCount: 1 });
    await seedClient('bloqueado', 'Bruno Bloqueado CL16', { lastVisitAt: recent, blocked: true });
    await seedClient('recusa', 'Rita Recusa CL16', { lastVisitAt: recent, notifyWhatsapp: false });
    const mensalistaClientId = await seedClient('mensalista', 'Marco Mensalista CL16', {
      lastVisitAt: recent,
      visitCount: 3,
      totalSpentCents: 15_000,
    });

    // Mensalista: plano + assinatura ativa + uso do ciclo corrente.
    const clientPlan = await prisma.clientPlan.create({
      data: { tenantId, name: 'Corte Semanal CL16', priceCents: 12_000 },
      select: { id: true },
    });
    const periodStart = new Date(Date.now() - 5 * DAY_MS);
    const periodEnd = new Date(Date.now() + 25 * DAY_MS);
    const subscription = await prisma.clientSubscription.create({
      data: {
        tenantId,
        clientId: mensalistaClientId,
        planId: clientPlan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextChargeAt: periodEnd,
      },
      select: { id: true },
    });
    await prisma.subscriptionUsage.create({
      data: {
        tenantId,
        subscriptionId: subscription.id,
        serviceId,
        periodStart,
        periodEnd,
        quota: 4,
        used: 3,
      },
    });

    // Histórico da Ana: uma comanda fechada com item, barbeiro e pagamento.
    const anaClientId = clientIds[0]!;
    const order = await prisma.order.create({
      data: {
        tenantId,
        clientId: anaClientId,
        barberId,
        number: 1,
        status: OrderStatus.CLOSED,
        subtotalCents: 5_000,
        totalCents: 5_000,
        closedAt: new Date(Date.now() - 2 * DAY_MS),
        items: {
          create: {
            tenantId,
            kind: OrderItemKind.SERVICE,
            serviceId,
            barberId,
            description: 'Corte CL16',
            quantity: 1,
            unitPriceCents: 5_000,
            totalCents: 5_000,
          },
        },
      },
      select: { id: true },
    });
    await prisma.payment.create({
      data: {
        tenantId,
        orderId: order.id,
        method: PaymentMethod.PIX,
        status: PaymentStatus.PAID,
        amountCents: 5_000,
        paidAt: new Date(),
      },
    });
    await prisma.loyaltyPoints.create({
      data: {
        tenantId,
        clientId: anaClientId,
        points: 50,
        kind: LoyaltyPointsKind.EARN,
        reason: 'Ganho por consumo CL16',
      },
    });

    const login = await api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200);
    ownerToken = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { phone: { startsWith: `55${run}` } } });
    await prisma.saasPlan.deleteMany({ where: { code: planCode } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Status, chips e contagens ────────────────────────────────────────────

  it('deriva um status por cliente e as contagens dos chips somam exatamente o total', async () => {
    const response = await asOwner().get('/clients?perPage=100').expect(200);
    const byId = new Map<string, string>(
      response.body.data.map((row: { id: string; status: string }) => [row.id, row.status]),
    );

    expect(byId.get(profile.ativo!)).toBe('ATIVO');
    expect(byId.get(profile.inativo!)).toBe('INATIVO');
    expect(byId.get(profile.mensalista!)).toBe('MENSALISTA');
    expect(byId.get(profile.bloqueado!)).toBe('BLOQUEADO');

    const counts = response.body.counts;
    expect(counts.ativo + counts.inativo + counts.mensalista + counts.bloqueado).toBe(counts.all);
    expect(counts.all).toBe(response.body.meta.total);
  });

  it('cada chip devolve apenas o próprio status, e a contagem bate com a lista', async () => {
    for (const status of ['ATIVO', 'INATIVO', 'MENSALISTA', 'BLOQUEADO']) {
      const response = await asOwner().get(`/clients?status=${status}&perPage=100`).expect(200);
      const statuses = response.body.data.map((row: { status: string }) => row.status);
      expect(new Set(statuses)).toEqual(new Set([status]));
      expect(response.body.meta.total).toBe(
        response.body.counts[status.toLowerCase() as 'ativo'],
      );
    }
  });

  it('a busca é do servidor: filtra a base inteira e as contagens acompanham', async () => {
    const response = await asOwner().get('/clients?search=Marco%20Mensalista').expect(200);

    expect(response.body.meta.total).toBe(1);
    expect(response.body.data[0].id).toBe(profile.mensalista);
    // Os chips passam a contar dentro da busca, não a base toda.
    expect(response.body.counts.all).toBe(1);
    expect(response.body.counts.mensalista).toBe(1);
    expect(response.body.counts.ativo).toBe(0);
  });

  // ── Pontos: `null` não é `0` ─────────────────────────────────────────────

  it('sem programa de fidelidade os pontos vêm `null`; ligado, vêm somados do razão', async () => {
    const off = await asOwner().get(`/clients/${profile.ativo}`).expect(200);
    expect(off.body.loyaltyPoints).toBeNull();
    expect(off.body.loyaltyEnabled).toBe(false);

    await prisma.loyaltyProgram.create({ data: { tenantId, active: true } });

    const on = await asOwner().get(`/clients/${profile.ativo}`).expect(200);
    expect(on.body.loyaltyPoints).toBe(50);
    expect(on.body.loyaltyEnabled).toBe(true);
    expect(on.body.loyaltyLedger[0].points).toBe(50);
    expect(on.body.loyaltyLedger[0].description).toBe('Ganho por consumo CL16');

    // Cliente sem lançamento nenhum pontua zero — e isso é diferente de `null`.
    const semPontos = await asOwner().get(`/clients/${profile.inativo}`).expect(200);
    expect(semPontos.body.loyaltyPoints).toBe(0);
  });

  // ── Drawer ───────────────────────────────────────────────────────────────

  it('o perfil traz ticket médio, histórico da comanda fechada e as 4 sub-abas preenchidas', async () => {
    const response = await asOwner().get(`/clients/${profile.ativo}`).expect(200);

    // 20.000 / 4 visitas.
    expect(response.body.ticketAverageCents).toBe(5_000);
    expect(response.body.noShowCount).toBe(1);

    const [entry] = response.body.history;
    expect(entry.totalCents).toBe(5_000);
    expect(entry.items).toEqual(['Corte CL16']);
    expect(entry.barberName).toBe('Barbeiro CL16');
    expect(entry.paymentMethods).toEqual(['PIX']);

    // Sem assinatura o bloco é `null` — a aba mostra "Sem assinatura ativa".
    expect(response.body.subscription).toBeNull();
  });

  it('o mensalista traz plano, preço e uso do ciclo corrente', async () => {
    const response = await asOwner().get(`/clients/${profile.mensalista}`).expect(200);

    expect(response.body.subscription.planName).toBe('Corte Semanal CL16');
    expect(response.body.subscription.priceCents).toBe(12_000);
    expect(response.body.subscription.status).toBe('ACTIVE');
    expect(response.body.subscription.usedTotal).toBe(3);
    expect(response.body.subscription.quotaTotal).toBe(4);
  });

  it('perfil inexistente responde 404, não 500', async () => {
    await asOwner().get('/clients/cl16-nao-existe').expect(404);
  });

  // ── Modal "Novo cliente" ─────────────────────────────────────────────────

  it('o cadastro grava a ficha inteira do modal, inclusive o toggle de mensagens', async () => {
    const phone = `5511${String(Date.now()).slice(-9)}`;
    const created = await asOwner()
      .post('/clients')
      .send({
        name: 'Novo Cadastro CL16',
        phone,
        email: `novo-cl16-${run}@barbervp.test`,
        birthDate: '1990-05-12',
        notes: 'Gosta de máquina 2 nas laterais.',
        acceptsMessages: false,
      })
      .expect(201);

    expect(created.body.email).toBe(`novo-cl16-${run}@barbervp.test`);
    expect(created.body.birthDate).toBe('1990-05-12');
    expect(created.body.notes).toBe('Gosta de máquina 2 nas laterais.');
    expect(created.body.acceptsMessages).toBe(false);
    // Sem visita e recém-criado: é novo, não "inativo".
    expect(created.body.status).toBe('ATIVO');

    const client = await prisma.client.findUnique({ where: { phone }, select: { id: true } });
    if (client) clientIds.push(client.id);
  });

  // ── Ações em lote ────────────────────────────────────────────────────────

  it('bloqueio em lote muda os selecionados e o desbloqueio devolve', async () => {
    const ids = [profile.ativo!, profile.inativo!];

    const blocked = await asOwner().post('/clients/bulk/block').send({ ids, blocked: true }).expect(201);
    expect(blocked.body.updated).toBe(2);

    const listed = await asOwner().get('/clients?status=BLOQUEADO&perPage=100').expect(200);
    const blockedIds = listed.body.data.map((row: { id: string }) => row.id);
    expect(blockedIds).toEqual(expect.arrayContaining(ids));

    const released = await asOwner().post('/clients/bulk/block').send({ ids, blocked: false }).expect(201);
    expect(released.body.updated).toBe(2);
  });

  it('a mensagem em lote pula quem recusou receber e conta os dois grupos', async () => {
    const response = await asOwner()
      .post('/clients/bulk/message')
      .send({ ids: [profile.ativo!, profile.recusa!], body: 'Olá {nome}, temos horários!' })
      .expect(201);

    expect(response.body.queued).toBe(1);
    expect(response.body.skipped).toBe(1);

    // O corpo sai com o `{nome}` já substituído, no outbox do tenant.
    const outbox = await prisma.notificationOutbox.findFirst({
      where: { tenantId, templateKey: 'CLIENT_BROADCAST' },
      orderBy: { createdAt: 'desc' },
      select: { body: true },
    });
    expect(outbox?.body).toContain('Ana Ativa CL16');
    expect(outbox?.body).not.toContain('{nome}');
  });

  // ── Exportação ───────────────────────────────────────────────────────────

  it('o CSV respeita o filtro e, com `ids`, exporta só a seleção', async () => {
    const all = await asOwner().get('/clients/export').expect(200);
    expect(all.headers['content-type']).toContain('text/csv');
    expect(all.text).toContain('"Nome";"WhatsApp"');
    expect(all.text).toContain('Ana Ativa CL16');
    expect(all.text).toContain('Ivo Inativo CL16');

    const selection = await asOwner().get(`/clients/export?ids=${profile.mensalista}`).expect(200);
    expect(selection.text).toContain('Marco Mensalista CL16');
    expect(selection.text).not.toContain('Ana Ativa CL16');
  });
});
