import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import {
  MembershipRole,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Aba Fidelidade (agente 21) de ponta a ponta — e a aba tem UM assunto só:
 * as assinaturas vendidas pela casa. Pontos e sorteios saíram do protótipo, e
 * dois casos aqui guardam essa decisão: `/loyalty/raffles` e `/loyalty/clients`
 * precisam continuar mortos.
 *
 * O que mais dói na tela e por isso é o fio condutor dos casos:
 *   1. MRR e "N assinantes" do card vêm do servidor, não de conta na tela;
 *   2. "Pagamento" é derivado (Pago / Pendente / Atrasado / Pausado);
 *   3. excluir um plano com histórico é PROIBIDO — o caminho é arquivar;
 *   4. pausar/cancelar do painel são a MESMA operação da área do cliente.
 */
describe('fidelidade — assinaturas (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-fid-${run}`;
  const profissionalSlug = `e2e-fid-pro-${run}`;
  const password = 'FidelidadeSenha1';
  const planCodes = [`e2e-fid-avancado-${run}`, `e2e-fid-profissional-${run}`];

  let tenantId: string;
  let ownerToken: string;
  let barberToken: string;
  let profissionalToken: string;
  let corteId: string;
  let barbaId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const asOwner = () => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${ownerToken}`),
    delete: (path: string) => api().delete(url(path)).set('Authorization', `Bearer ${ownerToken}`),
  });

  const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

  /** Assinante pronto: plano, ciclo corrente e — opcionalmente — a cobrança quitada. */
  const subscribe = async (input: {
    name: string;
    phone: string;
    planId: string;
    quota: number;
    used: number;
    status?: SubscriptionStatus;
    nextChargeInDays: number;
    paidAt?: Date;
  }): Promise<string> => {
    // `Client` é global (telefone único) e o vínculo com a barbearia é o
    // `ClientProfile` — o mesmo caminho do resto da suíte.
    const client = await prisma.client.create({
      data: {
        name: input.name,
        phone: input.phone,
        profiles: { create: { tenantId, phone: input.phone } },
      },
      select: { id: true },
    });
    const periodStart = daysFromNow(-5);
    const periodEnd = daysFromNow(25);

    const subscription = await prisma.clientSubscription.create({
      data: {
        tenantId,
        clientId: client.id,
        planId: input.planId,
        status: input.status ?? SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextChargeAt: daysFromNow(input.nextChargeInDays),
        usages: {
          create: {
            tenantId,
            serviceId: corteId,
            periodStart,
            periodEnd,
            quota: input.quota,
            used: input.used,
          },
        },
        ...(input.paidAt
          ? {
              payments: {
                create: {
                  tenantId,
                  method: PaymentMethod.CREDIT,
                  status: PaymentStatus.PAID,
                  amountCents: 12_000,
                  paidAt: input.paidAt,
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });
    return subscription.id;
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const [avancado, profissional] = await Promise.all([
      prisma.saasPlan.create({
        data: {
          code: planCodes[0]!,
          name: 'Avançado (e2e fid)',
          priceCents: 13_900,
          tier: PlanTier.AVANCADO,
          maxBarbers: null,
          features: featuresForTier(PlanTier.AVANCADO) as unknown as object,
        },
        select: { id: true },
      }),
      prisma.saasPlan.create({
        data: {
          code: planCodes[1]!,
          name: 'Profissional (e2e fid)',
          priceCents: 8_900,
          tier: PlanTier.PROFISSIONAL,
          maxBarbers: 4,
          features: featuresForTier(PlanTier.PROFISSIONAL) as unknown as object,
        },
        select: { id: true },
      }),
    ]);

    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: 'Barbearia Fidelidade (e2e)',
        planId: avancado.id,
        settings: { create: {} },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const profissionalTenant = await prisma.tenant.create({
      data: {
        slug: profissionalSlug,
        name: 'Barbearia Profissional (e2e fid)',
        planId: profissional.id,
        settings: { create: {} },
      },
      select: { id: true },
    });

    const [corte, barba] = await Promise.all([
      prisma.service.create({
        data: { tenantId, name: 'Corte Fid', durationMin: 30, priceCents: 5_000 },
        select: { id: true },
      }),
      prisma.service.create({
        data: { tenantId, name: 'Barba Fid', durationMin: 20, priceCents: 3_500 },
        select: { id: true },
      }),
    ]);
    corteId = corte.id;
    barbaId = barba.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-fid-owner-${run}@barbervp.test`;
    const barberEmail = `e2e-fid-barber-${run}@barbervp.test`;
    const proEmail = `e2e-fid-pro-${run}@barbervp.test`;

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dono Fid',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });
    await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro Fid',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
    });
    await prisma.user.create({
      data: {
        email: proEmail,
        name: 'Dono Pro Fid',
        passwordHash,
        memberships: { create: { tenantId: profissionalTenant.id, role: MembershipRole.OWNER } },
      },
    });

    const logins = await Promise.all([
      api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200),
      api().post(url('/auth/login')).send({ email: barberEmail, password }).expect(200),
      api().post(url('/auth/login')).send({ email: proEmail, password }).expect(200),
    ]);
    ownerToken = logins[0].body.accessToken;
    barberToken = logins[1].body.accessToken;
    profissionalToken = logins[2].body.accessToken;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, profissionalSlug] } } });
    await prisma.saasPlan.deleteMany({ where: { code: { in: planCodes } } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── O que saiu do protótipo continua fora ──────────────────────────────

  it.each([['/loyalty/raffles'], ['/loyalty/clients']])(
    '%s não existe mais — a sub-aba saiu do desenho',
    async (path) => {
      await asOwner().get(path as string).expect(404);
    },
  );

  // ── Tenant vazio ───────────────────────────────────────────────────────

  it('tenant sem plano nenhum responde as duas listas vazias, sem quebrar', async () => {
    const [plans, subscribers] = await Promise.all([
      asOwner().get('/loyalty/plans').expect(200),
      asOwner().get('/loyalty/subscribers').expect(200),
    ]);
    expect(plans.body).toEqual([]);
    expect(subscribers.body).toEqual([]);
  });

  // ── CRUD do plano ──────────────────────────────────────────────────────

  it('cria um plano com dois serviços e devolve o card pronto', async () => {
    const response = await asOwner()
      .post('/loyalty/plans')
      .send({
        name: 'Clube Fid',
        priceCents: 12_000,
        billingDay: 5,
        items: [
          { serviceId: corteId, quota: 4 },
          { serviceId: barbaId, quota: 2 },
        ],
      })
      .expect(201);

    expect(response.body.name).toBe('Clube Fid');
    expect(response.body.active).toBe(true);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.subscriberCount).toBe(0);
    // Sem assinante o MRR é zero e o plano ainda pode ser excluído de verdade.
    expect(response.body.mrrCents).toBe(0);
    expect(response.body.canDelete).toBe(true);
  });

  it('recusa dia de cobrança acima de 28 — o select do modal só vai até lá', async () => {
    await asOwner()
      .post('/loyalty/plans')
      .send({ name: 'Dia inválido', priceCents: 1_000, billingDay: 31, items: [{ serviceId: corteId, quota: 1 }] })
      .expect(400);
  });

  it('recusa serviço de outra barbearia', async () => {
    const outro = await prisma.tenant.findFirstOrThrow({ where: { slug: profissionalSlug }, select: { id: true } });
    const servicoAlheio = await prisma.service.create({
      data: { tenantId: outro.id, name: 'Corte Alheio', durationMin: 30, priceCents: 5_000 },
      select: { id: true },
    });

    await asOwner()
      .post('/loyalty/plans')
      .send({ name: 'Plano Invasor', priceCents: 1_000, items: [{ serviceId: servicoAlheio.id, quota: 1 }] })
      .expect(400);
  });

  it('recusa nome repetido com 409, e não com um 500 de chave única', async () => {
    const response = await asOwner()
      .post('/loyalty/plans')
      .send({ name: 'Clube Fid', priceCents: 9_000, items: [{ serviceId: corteId, quota: 1 }] })
      .expect(409);
    expect(response.body.code).toBe('CLIENT_PLAN_NAME_TAKEN');
  });

  it('exclui um plano que nunca teve assinante', async () => {
    const criado = await asOwner()
      .post('/loyalty/plans')
      .send({ name: 'Plano Efêmero', priceCents: 5_000, items: [{ serviceId: corteId, quota: 1 }] })
      .expect(201);

    await asOwner().delete(`/loyalty/plans/${criado.body.id}`).expect(204);

    const lista = await asOwner().get('/loyalty/plans').expect(200);
    expect(lista.body.find((plan: { id: string }) => plan.id === criado.body.id)).toBeUndefined();
    // O nome volta a ficar livre — exclusão de verdade, não `deletedAt`.
    await asOwner()
      .post('/loyalty/plans')
      .send({ name: 'Plano Efêmero', priceCents: 5_000, items: [{ serviceId: corteId, quota: 1 }] })
      .expect(201);
  });

  // ── Assinantes, MRR e situação de pagamento ────────────────────────────

  it('MRR e contagem de assinantes saem do servidor e ignoram os pausados', async () => {
    const plano = await asOwner().get('/loyalty/plans').expect(200);
    const clube = plano.body.find((row: { name: string }) => row.name === 'Clube Fid');

    await subscribe({
      name: 'Assinante Pago',
      phone: `55119${run}1`,
      planId: clube.id,
      quota: 4,
      used: 3,
      nextChargeInDays: 10,
      paidAt: new Date(),
    });
    await subscribe({
      name: 'Assinante Pendente',
      phone: `55119${run}2`,
      planId: clube.id,
      quota: 4,
      used: 1,
      nextChargeInDays: 10,
    });
    await subscribe({
      name: 'Assinante Atrasado',
      phone: `55119${run}3`,
      planId: clube.id,
      quota: 4,
      used: 4,
      status: SubscriptionStatus.PAST_DUE,
      nextChargeInDays: -2,
    });
    await subscribe({
      name: 'Assinante Pausado',
      phone: `55119${run}4`,
      planId: clube.id,
      quota: 4,
      used: 0,
      status: SubscriptionStatus.PAUSED,
      nextChargeInDays: 10,
    });

    const depois = await asOwner().get('/loyalty/plans').expect(200);
    const card = depois.body.find((row: { id: string }) => row.id === clube.id);

    // 4 assinantes não cancelados; só 3 faturam (o pausado não).
    expect(card.subscriberCount).toBe(4);
    expect(card.mrrCents).toBe(12_000 * 3);
    // Já teve assinante ⇒ o diálogo do protótipo passa a oferecer "Arquivar".
    expect(card.canDelete).toBe(false);
  });

  it('a coluna "Pagamento" traz os quatro estados e os usos somados do ciclo', async () => {
    const response = await asOwner().get('/loyalty/subscribers').expect(200);
    const byName = new Map<string, { paymentStatus: string; usedTotal: number; quotaTotal: number }>(
      response.body.map((row: { clientName: string }) => [row.clientName, row]),
    );

    expect(byName.get('Assinante Pago')!.paymentStatus).toBe('PAID');
    expect(byName.get('Assinante Pendente')!.paymentStatus).toBe('PENDING');
    expect(byName.get('Assinante Atrasado')!.paymentStatus).toBe('OVERDUE');
    expect(byName.get('Assinante Pausado')!.paymentStatus).toBe('PAUSED');

    expect(byName.get('Assinante Pago')!.usedTotal).toBe(3);
    expect(byName.get('Assinante Pago')!.quotaTotal).toBe(4);
  });

  it('não exclui plano com histórico — 409 pedindo para arquivar', async () => {
    const plano = await asOwner().get('/loyalty/plans').expect(200);
    const clube = plano.body.find((row: { name: string }) => row.name === 'Clube Fid');

    const response = await asOwner().delete(`/loyalty/plans/${clube.id}`).expect(409);
    expect(response.body.code).toBe('CLIENT_PLAN_HAS_SUBSCRIBERS');
  });

  it('arquivar tira o plano da vitrine, mantém os assinantes e reativar desfaz', async () => {
    const plano = await asOwner().get('/loyalty/plans').expect(200);
    const clube = plano.body.find((row: { name: string }) => row.name === 'Clube Fid');

    const arquivado = await asOwner().patch(`/loyalty/plans/${clube.id}/archive`).expect(200);
    expect(arquivado.body.active).toBe(false);
    // Arquivar NÃO mexe em quem já assina — é a promessa do diálogo.
    expect(arquivado.body.subscriberCount).toBe(4);

    // O card arquivado continua na lista (o protótipo o desenha esmaecido), no fim.
    const comArquivado = await asOwner().get('/loyalty/plans').expect(200);
    expect(comArquivado.body.at(-1).id).toBe(clube.id);

    const reativado = await asOwner().patch(`/loyalty/plans/${clube.id}/reactivate`).expect(200);
    expect(reativado.body.active).toBe(true);
  });

  // ── Ações do menu da tabela ────────────────────────────────────────────

  it('pausar, retomar e cancelar mudam a linha do assinante', async () => {
    const lista = await asOwner().get('/loyalty/subscribers').expect(200);
    const alvo = lista.body.find((row: { clientName: string }) => row.clientName === 'Assinante Pago');

    const pausado = await asOwner().patch(`/loyalty/subscribers/${alvo.subscriptionId}/pause`).expect(200);
    expect(pausado.body.status).toBe('PAUSED');
    expect(pausado.body.paymentStatus).toBe('PAUSED');

    const retomado = await asOwner().patch(`/loyalty/subscribers/${alvo.subscriptionId}/resume`).expect(200);
    expect(retomado.body.status).toBe('ACTIVE');

    await asOwner().patch(`/loyalty/subscribers/${alvo.subscriptionId}/cancel`).expect(204);

    // Cancelado sai da tabela — a tela lista quem ainda assina.
    const depois = await asOwner().get('/loyalty/subscribers').expect(200);
    expect(
      depois.body.find((row: { subscriptionId: string }) => row.subscriptionId === alvo.subscriptionId),
    ).toBeUndefined();
  });

  it('o log registra o DONO como ator quando a ação sai do painel', async () => {
    const entries = await prisma.auditLog.findMany({
      where: { tenantId, action: 'subscription.paused' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(entries[0]?.actorUserId).toBeTruthy();
    expect(entries[0]?.actorClientId).toBeNull();
  });

  // ── Papéis e plano do SaaS ─────────────────────────────────────────────

  it('BARBER não administra assinaturas', async () => {
    await api().get(url('/loyalty/plans')).set('Authorization', `Bearer ${barberToken}`).expect(403);
    await api().get(url('/loyalty/subscribers')).set('Authorization', `Bearer ${barberToken}`).expect(403);
  });

  it('Profissional vê o paywall — a aba inteira é do Avançado', async () => {
    const response = await api()
      .get(url('/loyalty/plans'))
      .set('Authorization', `Bearer ${profissionalToken}`)
      .expect(403);
    expect(response.body.code).toBe('FEATURE_NOT_IN_PLAN');
  });
});
