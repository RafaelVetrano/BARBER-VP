import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import {
  AiMessageRole,
  MembershipRole,
  OrderStatus,
  PrismaClient,
  SubscriptionStatus,
  TenantStatus,
} from '@prisma/client';
import { AI_MESSAGE_LIMIT_BY_TIER, PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Aba **Assistente IA** (agente 28) de ponta a ponta.
 *
 * O que estes casos protegem, em ordem de importância:
 *  1. **a cota é do PLANO, e é do servidor** — 403 `AI_MESSAGE_LIMIT_REACHED`
 *     ao estourar. Sem isto o tier vira enfeite: o contador da tela é só o
 *     espelho deste número;
 *  2. **a cota é do TENANT, não de cada usuário** — contar por usuário
 *     multiplicaria o limite pelo número de donos e gerentes da casa;
 *  3. **limpar a conversa NÃO devolve mensagens** — era a brecha óbvia do
 *     "limpar conversa": apagar a linha zeraria o contador do mês;
 *  4. **o barbeiro não entra** — o assistente fala de faturamento e base de
 *     clientes, e o `DashboardFuncionario.dc.html` não tem a aba;
 *  5. **o cartão sai de dado real** — o número do cartão bate com a soma das
 *     comandas do período, não com um valor de exemplo do protótipo.
 */
describe('aba Assistente IA — cota por plano, histórico e cartões (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const password = 'AssistenteSenhaForte1';
  const ownerEmail = `e2e-ia-owner-${run}@barbervp.test`;
  const managerEmail = `e2e-ia-manager-${run}@barbervp.test`;
  const barberEmail = `e2e-ia-barber-${run}@barbervp.test`;

  /** Tenant no Essencial: é o único tier com limite pequeno o bastante para estourar. */
  const slug = `e2e-ia-${run}`;
  const planCode = `e2e-ia-plan-${run}`;
  const LIMIT = AI_MESSAGE_LIMIT_BY_TIER[PlanTier.ESSENCIAL]!;

  let tenantId: string;
  let ownerId: string;
  let ownerToken: string;
  let managerToken: string;
  let barberToken: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token}`),
    delete: (path: string) => api().delete(url(path)).set('Authorization', `Bearer ${token}`),
  });
  const asOwner = () => as(ownerToken);
  const asManager = () => as(managerToken);
  const asBarber = () => as(barberToken);

  const login = async (email: string): Promise<string> => {
    const response = await api().post(url('/auth/login')).send({ email, password }).expect(200);
    return response.body.accessToken as string;
  };

  /** Zera a conversa DE VERDADE entre casos — o endpoint só esconde, de propósito. */
  const wipe = () => prisma.aiChatMessage.deleteMany({ where: { tenantId } });

  /**
   * Enche a cota do mês sem passar pelo HTTP: `n` perguntas já gravadas.
   * Passar pelo endpoint gastaria N requisições só para chegar ao caso.
   */
  const fillQuota = (count: number, userId: string) =>
    prisma.aiChatMessage.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        tenantId,
        userId,
        role: AiMessageRole.USER,
        content: `pergunta ${index}`,
      })),
    });

  /**
   * Uma comanda FECHADA há `daysAgo` dias — é o dado real por trás do cartão
   * de faturamento. O cartão tem de somar isto, e não um valor de exemplo.
   */
  const closeOrder = async (totalCents: number, daysAgo: number): Promise<void> => {
    const closedAt = new Date(Date.now() - daysAgo * 24 * 3_600_000);
    const previous = await prisma.order.count({ where: { tenantId } });
    await prisma.order.create({
      data: {
        tenantId,
        number: previous + 1,
        status: OrderStatus.CLOSED,
        subtotalCents: totalCents,
        totalCents,
        openedAt: closedAt,
        closedAt,
      },
    });
  };

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

    const plan = await prisma.saasPlan.create({
      data: {
        code: planCode,
        name: 'Essencial (e2e assistente)',
        priceCents: 4_900,
        tier: PlanTier.ESSENCIAL,
        maxBarbers: 2,
        features: featuresForTier(PlanTier.ESSENCIAL) as unknown as object,
      },
      select: { id: true },
    });

    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: 'Barbearia Assistente (e2e)',
        planId: plan.id,
        status: TenantStatus.ACTIVE,
        settings: { create: {} },
        subscriptions: {
          create: {
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3_600_000),
          },
        },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dona Assistente',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
      select: { id: true },
    });
    ownerId = owner.id;

    await prisma.user.create({
      data: {
        email: managerEmail,
        name: 'Gerente Assistente',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.MANAGER } },
      },
    });

    const barberUser = await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro Assistente',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
      select: { id: true },
    });
    await prisma.barber.create({
      data: { tenantId, userId: barberUser.id, name: 'Barbeiro Assistente', email: barberEmail },
    });

    ownerToken = await login(ownerEmail);
    managerToken = await login(managerEmail);
    barberToken = await login(barberEmail);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${run}@barbervp.test` } } });
    await prisma.saasPlan.deleteMany({ where: { code: planCode } });
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await wipe();
    await prisma.order.deleteMany({ where: { tenantId } });
  });

  // ── Histórico e estados ────────────────────────────────────────────────

  describe('GET /assistant/messages', () => {
    it('tenant novo abre a aba vazia, com a cota do plano e as sugestões', async () => {
      const response = await asOwner().get('/assistant/messages').expect(200);

      expect(response.body.messages).toEqual([]);
      expect(response.body.usage).toEqual({ used: 0, limit: LIMIT });
      // Os chips do rodapé são do servidor: o front não inventa pergunta que o
      // driver ativo não responde.
      expect(response.body.suggestions.length).toBeGreaterThan(0);
    });

    it('o histórico volta em ordem de conversa, com o cartão junto', async () => {
      await closeOrder(12_000, 2);
      await asOwner()
        .post('/assistant/messages')
        .send({ content: 'Quanto faturei essa semana?' })
        .expect(201);

      const response = await asOwner().get('/assistant/messages').expect(200);
      const [first, second] = response.body.messages;

      expect(response.body.messages).toHaveLength(2);
      expect(first.role).toBe(AiMessageRole.USER);
      expect(second.role).toBe(AiMessageRole.ASSISTANT);
      expect(second.card).not.toBeNull();
      expect(second.card.kind).toBe('METRIC');
    });
  });

  // ── Cartões a partir de dado real ──────────────────────────────────────

  describe('POST /assistant/messages — os cartões', () => {
    it('sem comanda fechada o cartão não vem, e a resposta diz isso', async () => {
      const response = await asOwner()
        .post('/assistant/messages')
        .send({ content: 'Quanto faturei essa semana?' })
        .expect(201);

      // A barbearia do fixture não fecha comanda nenhuma: um cartão com R$ 0,00
      // e sparkline reta seria pior que a frase honesta.
      expect(response.body.message.card).toBeNull();
      expect(response.body.message.content).toContain('comanda fechada');
    });

    it('o cartão de faturamento soma as comandas REAIS do período', async () => {
      await closeOrder(10_000, 1);
      await closeOrder(5_000, 3);
      // Fora da janela de 7 dias: entra na base de comparação, nunca no total.
      await closeOrder(99_999, 9);

      const response = await asOwner()
        .post('/assistant/messages')
        .send({ content: 'Quanto faturei essa semana?' })
        .expect(201);

      const card = response.body.message.card;
      expect(card.kind).toBe('METRIC');
      expect(card.valueCents).toBe(15_000);
      // Um ponto por dia da janela, mesmo os zerados — senão a linha encurta e
      // mente sobre a inclinação.
      expect(card.series).toHaveLength(7);
      expect(card.series.reduce((sum: number, point: { valueCents: number }) => sum + point.valueCents, 0)).toBe(15_000);
      // O texto do balão repete o número do cartão, formatado em BRL.
      expect(response.body.message.content).toContain('150,00');
    });

    it('pergunta fora do repertório do driver mock não inventa cartão', async () => {
      const response = await asOwner()
        .post('/assistant/messages')
        .send({ content: 'Qual a capital da Mongólia?' })
        .expect(201);

      expect(response.body.message.card).toBeNull();
      expect(response.body.message.content).toContain('Navalha');
    });

    it('a pergunta em branco não passa da validação', async () => {
      await asOwner().post('/assistant/messages').send({ content: '' }).expect(400);
    });
  });

  // ── Cota do plano ──────────────────────────────────────────────────────

  describe('cota mensal por tier', () => {
    it('estourar o limite do Essencial responde 403 AI_MESSAGE_LIMIT_REACHED', async () => {
      await fillQuota(LIMIT, ownerId);

      const response = await asOwner()
        .post('/assistant/messages')
        .send({ content: 'Quanto faturei essa semana?' })
        .expect(403);

      expect(response.body.code).toBe('AI_MESSAGE_LIMIT_REACHED');
    });

    it('a cota é do TENANT: o gerente herda o que o dono já gastou', async () => {
      await fillQuota(LIMIT, ownerId);

      const history = await asManager().get('/assistant/messages').expect(200);
      expect(history.body.usage.used).toBe(LIMIT);

      // O gerente nem viu essas mensagens (o histórico é por usuário), mas o
      // limite é do plano da casa — e por isso ele também está bloqueado.
      expect(history.body.messages).toEqual([]);
      await asManager()
        .post('/assistant/messages')
        .send({ content: 'Quanto faturei essa semana?' })
        .expect(403);
    });

    it('só a mensagem DO USUÁRIO consome cota — a resposta não', async () => {
      await asOwner().post('/assistant/messages').send({ content: 'oi' }).expect(201);

      const response = await asOwner().get('/assistant/messages').expect(200);
      expect(response.body.messages).toHaveLength(2);
      expect(response.body.usage.used).toBe(1);
    });
  });

  // ── Limpar conversa ────────────────────────────────────────────────────

  describe('DELETE /assistant/messages', () => {
    it('limpa a conversa da tela mas NÃO devolve mensagens da cota', async () => {
      await fillQuota(LIMIT - 1, ownerId);
      await asOwner().post('/assistant/messages').send({ content: 'oi' }).expect(201);

      const cleared = await asOwner().delete('/assistant/messages').expect(200);

      expect(cleared.body.messages).toEqual([]);
      // O ponto do caso: a cota continua cheia depois da limpeza. Um `delete`
      // real daria LIMIT mensagens novas a quem clicasse no botão.
      expect(cleared.body.usage.used).toBe(LIMIT);
      await asOwner().post('/assistant/messages').send({ content: 'de novo' }).expect(403);
    });

    it('a conversa de um usuário não some da tela do outro', async () => {
      await asOwner().post('/assistant/messages').send({ content: 'oi' }).expect(201);
      await asManager().post('/assistant/messages').send({ content: 'olá' }).expect(201);

      await asOwner().delete('/assistant/messages').expect(200);

      const manager = await asManager().get('/assistant/messages').expect(200);
      expect(manager.body.messages).toHaveLength(2);
    });
  });

  // ── Papéis ─────────────────────────────────────────────────────────────

  describe('papéis', () => {
    it('BARBER não abre o assistente em nenhum dos verbos', async () => {
      await asBarber().get('/assistant/messages').expect(403);
      await asBarber().post('/assistant/messages').send({ content: 'oi' }).expect(403);
      await asBarber().delete('/assistant/messages').expect(403);
    });
  });
});
