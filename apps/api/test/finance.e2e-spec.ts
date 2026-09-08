import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import {
  AccountStatus,
  MembershipRole,
  OrderItemKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Agente 18 — a aba Financeiro de ponta a ponta.
 *
 * O que estes casos protegem, e por quê:
 *
 * 1. **A conferência do caixa é do DINHEIRO.** Somar Pix e cartão faria toda
 *    barbearia com maquininha fechar com uma "quebra" do tamanho das vendas no
 *    cartão. O extrato mostra tudo; a gaveta confere só o que passou por ela.
 * 2. **Os KPIs são do conjunto, não da página.** Vencidas / 7 dias / mês são
 *    somados no banco: calcular no cliente daria o total dos 50 itens da
 *    página, que é outro número.
 * 3. **`OVERDUE` é derivado.** A coluna guarda `PENDING`; vencida é quem
 *    passou da data. Gravar o status exigiria um job noturno e criaria estado
 *    que envelhece.
 * 4. **Parcelado e recorrente viram linhas de verdade**, com o vencimento
 *    andando certo na virada de mês (31/01 → 28/02, não 03/03).
 * 5. **O gate de plano cobre 3 sub-abas, não 6.** Caixa, contas bancárias e
 *    fluxo de caixa são de todo plano — este é o desvio que a auditoria achou.
 * 6. **O fluxo de caixa separa serviço de produto** rateando o pagamento pelo
 *    peso de cada item na comanda.
 */
describe('aba Financeiro (agente 18, e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-fin18-${run}`;
  const slugEssencial = `e2e-fin18-ess-${run}`;
  const planCode = `e2e-fin18-${run}`;
  const planCodeEssencial = `e2e-fin18-ess-${run}`;
  const password = 'FinanceiroDezoito1!';

  let tenantId: string;
  let ownerToken: string;
  let essencialToken: string;
  let bankAccountId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const asOwner = () => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${ownerToken}`),
  });

  /** `YYYY-MM-DD` a `days` de hoje, em UTC — o formato que os DTOs aceitam. */
  const dueDate = (days: number): string =>
    new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);

  const createTenant = async (
    tenantSlug: string,
    code: string,
    tier: PlanTier,
    label: string,
  ): Promise<{ tenantId: string; token: string }> => {
    const plan = await prisma.saasPlan.create({
      data: {
        code,
        name: `Plano ${label}`,
        priceCents: 9_900,
        tier,
        maxBarbers: null,
        features: featuresForTier(tier) as unknown as object,
      },
      select: { id: true },
    });
    const tenant = await prisma.tenant.create({
      data: { slug: tenantSlug, name: `Barbearia ${label}`, planId: plan.id, settings: { create: {} } },
      select: { id: true },
    });
    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const email = `e2e-fin18-${label.toLowerCase()}-${run}@barbervp.test`;
    await prisma.user.create({
      data: {
        email,
        name: `Dono ${label}`,
        passwordHash,
        memberships: { create: { tenantId: tenant.id, role: MembershipRole.OWNER } },
      },
    });
    const login = await api().post(url('/auth/login')).send({ email, password }).expect(200);
    return { tenantId: tenant.id, token: login.body.accessToken };
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const avancado = await createTenant(slug, planCode, PlanTier.AVANCADO, 'AVANCADO');
    tenantId = avancado.tenantId;
    ownerToken = avancado.token;

    const essencial = await createTenant(slugEssencial, planCodeEssencial, PlanTier.ESSENCIAL, 'ESSENCIAL');
    essencialToken = essencial.token;

    const bankAccount = await prisma.bankAccount.create({
      data: {
        tenantId,
        name: 'Conta FIN18',
        type: 'Conta bancária',
        acceptedMethods: [PaymentMethod.PIX, PaymentMethod.CREDIT],
        balanceCents: 100_000,
      },
      select: { id: true },
    });
    bankAccountId = bankAccount.id;

    // ── Contas a pagar: uma vencida, uma nos 7 dias, uma fora da janela ────
    await prisma.accountPayable.createMany({
      data: [
        {
          tenantId,
          description: 'Aluguel vencido FIN18',
          category: 'Aluguel',
          amountCents: 100_000,
          dueDate: new Date(`${dueDate(-5)}T00:00:00.000Z`),
          status: AccountStatus.PENDING,
        },
        {
          tenantId,
          description: 'Energia da semana FIN18',
          category: 'Energia',
          amountCents: 30_000,
          dueDate: new Date(`${dueDate(3)}T00:00:00.000Z`),
          status: AccountStatus.PENDING,
        },
        {
          tenantId,
          // Fora dos 7 dias de propósito: se entrar no KPI, a janela está solta.
          description: 'Software do mês que vem FIN18',
          category: 'Software',
          amountCents: 20_000,
          dueDate: new Date(`${dueDate(20)}T00:00:00.000Z`),
          status: AccountStatus.PENDING,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, slugEssencial] } } });
    await prisma.user.deleteMany({ where: { email: { contains: `e2e-fin18-` } } });
    await prisma.saasPlan.deleteMany({ where: { code: { in: [planCode, planCodeEssencial] } } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Contas a pagar ───────────────────────────────────────────────────────

  it('os KPIs somam o CONJUNTO, mesmo com a página pedindo 1 item', async () => {
    const response = await asOwner().get('/finance/payables?perPage=1').expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta.total).toBe(3);
    // Somados no banco: nenhum deles cabe na página de 1 item devolvida acima.
    expect(response.body.summary.overdueCents).toBe(100_000);
    expect(response.body.summary.next7DaysCents).toBe(30_000);
  });

  it('a conta de ontem sai como OVERDUE sem ninguém ter gravado esse status', async () => {
    const stored = await prisma.accountPayable.findFirstOrThrow({
      where: { tenantId, description: 'Aluguel vencido FIN18' },
      select: { status: true },
    });
    expect(stored.status).toBe(AccountStatus.PENDING);

    const response = await asOwner().get('/finance/payables?perPage=50').expect(200);
    const row = response.body.data.find(
      (item: { description: string }) => item.description === 'Aluguel vencido FIN18',
    );
    expect(row.status).toBe('OVERDUE');
  });

  it('o parcelamento cria uma linha por parcela e a data anda no fim do mês', async () => {
    await asOwner()
      .post('/finance/payables')
      .send({
        description: 'Reforma parcelada FIN18',
        category: 'Manutenção',
        amountCents: 50_000,
        dueDate: '2026-01-31',
        installments: 3,
      })
      .expect(201);

    const rows = await prisma.accountPayable.findMany({
      where: { tenantId, description: 'Reforma parcelada FIN18' },
      orderBy: { installment: 'asc' },
      select: { installment: true, installments: true, dueDate: true, seriesId: true },
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-01-31',
      // Fevereiro de 2026 tem 28 dias: transbordar daria 03/03.
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(new Set(rows.map((row) => row.seriesId)).size).toBe(1);
    expect(rows[0]!.seriesId).not.toBeNull();
  });

  it('a conta recorrente materializa as ocorrências da frequência escolhida', async () => {
    await asOwner()
      .post('/finance/payables')
      .send({
        description: 'Lavanderia FIN18',
        category: 'Outro',
        amountCents: 8_000,
        dueDate: '2026-03-02',
        recurrence: 'WEEKLY',
      })
      .expect(201);

    const rows = await prisma.accountPayable.findMany({
      where: { tenantId, description: 'Lavanderia FIN18' },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true, recurrence: true },
    });

    expect(rows).toHaveLength(12);
    expect(rows[0]!.recurrence).toBe('WEEKLY');
    expect(rows[1]!.dueDate.toISOString().slice(0, 10)).toBe('2026-03-09');
  });

  it('marcar como paga duas vezes é conflito, não uma segunda baixa', async () => {
    const created = await asOwner()
      .post('/finance/payables')
      .send({
        description: 'Conta única FIN18',
        category: 'Internet',
        amountCents: 12_000,
        dueDate: dueDate(2),
      })
      .expect(201);

    const paid = await asOwner().patch(`/finance/payables/${created.body.id}/pay`).expect(200);
    expect(paid.body.status).toBe('PAID');
    expect(paid.body.paidAt).not.toBeNull();

    await asOwner().patch(`/finance/payables/${created.body.id}/pay`).expect(409);
  });

  // ── Caixa ────────────────────────────────────────────────────────────────

  it('o caixa fecha conferindo o DINHEIRO, ignorando Pix e cartão do extrato', async () => {
    await asOwner().post('/finance/cash-register/open').send({ openingCents: 20_000 }).expect(201);

    // Venda no cartão: aparece no extrato e no saldo do dia, mas não na gaveta.
    const withCard = await asOwner()
      .post('/finance/cash-register/movements')
      .send({
        direction: 'IN',
        amountCents: 90_000,
        description: 'Venda avulsa no cartão FIN18',
        category: 'Venda avulsa',
        method: 'CREDIT',
      })
      .expect(201);
    expect(withCard.body.register.entriesCents).toBe(90_000);
    expect(withCard.body.register.expectedCashCents).toBe(20_000);

    // Venda em dinheiro: essa sim entra na gaveta.
    const withCash = await asOwner()
      .post('/finance/cash-register/movements')
      .send({
        direction: 'IN',
        amountCents: 10_000,
        description: 'Venda avulsa em dinheiro FIN18',
        category: 'Venda avulsa',
        method: 'CASH',
      })
      .expect(201);
    expect(withCash.body.register.expectedCashCents).toBe(30_000);
    expect(withCash.body.register.currentCents).toBe(120_000);

    // Conferência com R$ 2,00 a menos: quebra de caixa de 200 centavos.
    const closed = await asOwner()
      .post('/finance/cash-register/close')
      .send({ countedCents: 29_800 })
      .expect(201);

    expect(closed.body.open).toBe(false);
    expect(closed.body.register.expectedCents).toBe(30_000);
    expect(closed.body.register.differenceCents).toBe(-200);
  });

  it('não se tira da gaveta mais dinheiro do que há nela', async () => {
    await asOwner().post('/finance/cash-register/open').send({ openingCents: 5_000 }).expect(201);

    await asOwner()
      .post('/finance/cash-register/movements')
      .send({
        direction: 'OUT',
        amountCents: 50_000,
        description: 'Sangria impossível FIN18',
        category: 'Sangria',
        method: 'CASH',
      })
      .expect(400);

    // Já no cartão não há gaveta que limite — é a conta do adquirente.
    await asOwner()
      .post('/finance/cash-register/movements')
      .send({
        direction: 'OUT',
        amountCents: 50_000,
        description: 'Estorno no cartão FIN18',
        category: 'Despesa operacional',
        method: 'CREDIT',
      })
      .expect(201);

    await asOwner().post('/finance/cash-register/close').send({ countedCents: 5_000 }).expect(201);
  });

  it('a categoria tem de casar com a direção do lançamento', async () => {
    await asOwner().post('/finance/cash-register/open').send({ openingCents: 1_000 }).expect(201);

    await asOwner()
      .post('/finance/cash-register/movements')
      .send({
        direction: 'IN',
        amountCents: 1_000,
        description: 'Sangria ao contrário FIN18',
        category: 'Sangria',
        method: 'CASH',
      })
      .expect(400);

    await asOwner().post('/finance/cash-register/close').send({ countedCents: 1_000 }).expect(201);
  });

  it('abrir um segundo caixa com um já aberto é conflito', async () => {
    await asOwner().post('/finance/cash-register/open').send({ openingCents: 1_000 }).expect(201);
    await asOwner().post('/finance/cash-register/open').send({ openingCents: 500 }).expect(409);
    await asOwner().post('/finance/cash-register/close').send({ countedCents: 1_000 }).expect(201);
  });

  // ── Contas bancárias ─────────────────────────────────────────────────────

  it('a conta bancária guarda tipo e formas aceitas, e o nome é único', async () => {
    const list = await asOwner().get('/finance/bank-accounts').expect(200);
    const account = list.body.find((item: { id: string }) => item.id === bankAccountId);
    expect(account.type).toBe('Conta bancária');
    expect(account.acceptedMethods).toEqual(['PIX', 'CREDIT']);

    await asOwner()
      .post('/finance/bank-accounts')
      .send({ name: 'Conta FIN18', type: 'Dinheiro em espécie' })
      .expect(409);
  });

  // ── Fluxo de caixa ───────────────────────────────────────────────────────

  it('o fluxo separa serviço de produto rateando o pagamento pelos itens', async () => {
    const barber = await prisma.barber.create({
      data: { tenantId, name: 'Barbeiro FIN18' },
      select: { id: true },
    });
    const now = new Date();

    // Comanda de R$ 100: R$ 75 de serviço e R$ 25 de produto, pagos num Pix só.
    await prisma.order.create({
      data: {
        tenantId,
        barberId: barber.id,
        number: 1,
        status: OrderStatus.CLOSED,
        subtotalCents: 10_000,
        totalCents: 10_000,
        closedAt: now,
        items: {
          create: [
            {
              tenantId,
              kind: OrderItemKind.SERVICE,
              description: 'Corte FIN18',
              quantity: 1,
              unitPriceCents: 7_500,
              totalCents: 7_500,
            },
            {
              tenantId,
              kind: OrderItemKind.PRODUCT,
              description: 'Pomada FIN18',
              quantity: 1,
              unitPriceCents: 2_500,
              totalCents: 2_500,
            },
          ],
        },
        payments: {
          create: {
            tenantId,
            method: PaymentMethod.PIX,
            status: PaymentStatus.PAID,
            amountCents: 10_000,
            paidAt: now,
          },
        },
      },
    });

    const response = await asOwner().get('/finance/cash-flow?months=1').expect(200);
    const [month] = response.body.months;

    const services = month.inflowByCategory.find((c: { name: string }) => c.name === 'Serviços');
    const products = month.inflowByCategory.find((c: { name: string }) => c.name === 'Produtos');
    expect(services.amountCents).toBe(7_500);
    expect(products.amountCents).toBe(2_500);
    expect(month.inCents).toBe(10_000);
    expect(month.accumulatedCents).toBe(month.balanceCents);
  });

  // ── Gate de plano ────────────────────────────────────────────────────────

  it('o Essencial é barrado nas 3 sub-abas travadas e passa nas outras 3', async () => {
    const asEssencial = (path: string) =>
      api().get(url(path)).set('Authorization', `Bearer ${essencialToken}`);

    for (const path of ['/finance/payables', '/finance/receivables', '/commissions/vales']) {
      await asEssencial(path).expect(403);
    }
    // `LOCKED_FIN_TABS` do protótipo tem 3 chaves, não 6 — estas continuam de pé.
    for (const path of ['/finance/cash-register', '/finance/bank-accounts', '/finance/cash-flow']) {
      await asEssencial(path).expect(200);
    }
  });
});
