import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { MembershipRole, PrismaClient, SaasInvoiceStatus } from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Aba **Configurações** (agente 26) de ponta a ponta.
 *
 * O que estes casos protegem, em ordem de importância:
 *  1. **plano e cobrança são do DONO** — o gerente administra a barbearia, mas
 *     não troca o plano nem lê as faturas (`SPEC.md` → RBAC). Estava aberto
 *     aos dois: um gerente podia fazer downgrade e desligar barbeiros;
 *  2. **os ganhos e perdas da troca são calculados na API** — sobre o
 *     `features` REAL dos dois planos, com os nomes dos barbeiros que o
 *     downgrade desliga. Nada disso pode voltar a ser texto de tela;
 *  3. **a troca passa pelo `PAYMENT_ADAPTER`** — a fatura nasce com
 *     `externalId`, como toda cobrança do produto;
 *  4. **o almoço da casa existe e é validado** — par completo e dentro do
 *     expediente;
 *  5. **o recibo em PDF é do tenant que pediu** — e só dele.
 */
describe('aba Configurações — barbearia, unidades, plano e preferências (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-cfg-${run}`;
  const otherSlug = `e2e-cfg-outra-${run}`;
  const password = 'ConfigSenhaForte1';
  const ownerEmail = `e2e-cfg-owner-${run}@barbervp.test`;
  const managerEmail = `e2e-cfg-manager-${run}@barbervp.test`;

  const planCodes = [`e2e-cfg-ess-${run}`, `e2e-cfg-prof-${run}`, `e2e-cfg-av-${run}`];

  let tenantId: string;
  let otherTenantId: string;
  let essencialId: string;
  let profissionalId: string;
  let avancadoId: string;
  let ownerToken: string;
  let managerToken: string;
  let ownerBarberId: string;
  let serviceId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${token}`),
  });
  const asOwner = () => as(ownerToken);
  const asManager = () => as(managerToken);

  const changePlan = (planId: string) =>
    asOwner().post('/settings/plan/change').send({ planId }).expect(201);

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

    const plan = (code: string, name: string, tier: PlanTier, maxBarbers: number | null, priceCents: number) =>
      prisma.saasPlan.create({
        data: {
          code,
          name,
          priceCents,
          tier,
          maxBarbers,
          features: featuresForTier(tier) as unknown as object,
          marketing: { baseLabel: tier === PlanTier.ESSENCIAL ? null : 'Tudo do anterior, mais:', features: ['Bullet de teste'] },
        },
        select: { id: true },
      });

    const [essencial, profissional, avancado] = await Promise.all([
      plan(planCodes[0]!, 'Essencial (e2e cfg)', PlanTier.ESSENCIAL, 2, 4_900),
      plan(planCodes[1]!, 'Profissional (e2e cfg)', PlanTier.PROFISSIONAL, 4, 8_900),
      plan(planCodes[2]!, 'Avançado (e2e cfg)', PlanTier.AVANCADO, null, 13_900),
    ]);
    essencialId = essencial.id;
    profissionalId = profissional.id;
    avancadoId = avancado.id;

    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: 'Barbearia Config (e2e)',
        planId: avancado.id,
        settings: { create: {} },
        businessHours: {
          create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            opensAt: 540,
            closesAt: 1_200,
            closed: weekday === 0,
          })),
        },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const other = await prisma.tenant.create({
      data: { slug: otherSlug, name: 'Outra Barbearia (e2e cfg)', planId: avancado.id, settings: { create: {} } },
      select: { id: true },
    });
    otherTenantId = other.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dona Config',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
      select: { id: true },
    });

    await prisma.user.create({
      data: {
        email: managerEmail,
        name: 'Gerente Config',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.MANAGER } },
      },
    });

    // O dono é barbeiro (nunca perde a vaga) + três colegas: com `maxBarbers`
    // 2 no Essencial, o downgrade tem de desligar exatamente dois deles.
    const ownerBarber = await prisma.barber.create({
      data: { tenantId, userId: owner.id, name: 'Dona Config', sortOrder: 0 },
      select: { id: true },
    });
    ownerBarberId = ownerBarber.id;
    await prisma.barber.createMany({
      data: [
        { tenantId, name: 'Barbeiro Um', sortOrder: 1 },
        { tenantId, name: 'Barbeiro Dois', sortOrder: 2 },
        { tenantId, name: 'Barbeiro Três', sortOrder: 3 },
      ],
    });

    // O barbeiro-dono atende um serviço e trabalha TODOS os dias, inclusive
    // domingo. É de propósito: é assim que se prova que quem fecha o domingo é
    // o expediente da CASA, e não a escala dele.
    const service = await prisma.service.create({
      data: { tenantId, name: 'Corte Config', durationMin: 30, priceCents: 5_000 },
      select: { id: true },
    });
    serviceId = service.id;

    await prisma.barberService.create({ data: { tenantId, barberId: ownerBarber.id, serviceId } });
    await prisma.workSchedule.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        tenantId,
        barberId: ownerBarber.id,
        weekday,
        startTime: 540,
        endTime: 1_200,
        isDayOff: false,
      })),
    });

    const login = async (email: string) => {
      const response = await api().post(url('/auth/login')).send({ email, password }).expect(200);
      return response.body.accessToken as string;
    };
    ownerToken = await login(ownerEmail);
    managerToken = await login(managerEmail);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, otherSlug] } } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${run}@barbervp.test` } } });
    await prisma.saasPlan.deleteMany({ where: { code: { in: planCodes } } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Barbearia ───────────────────────────────────────────────────────────

  describe('dados e horário de funcionamento', () => {
    it('grava o almoço DA CASA e devolve o par nos dois lados', async () => {
      const before = await asOwner().get('/settings/barbershop').expect(200);
      expect(before.body.businessHours).toHaveLength(7);
      expect(before.body.businessHours[1].lunchStart).toBeNull();

      const hours = before.body.businessHours.map((hour: { weekday: number }) =>
        hour.weekday === 1
          ? { ...hour, lunchStart: 720, lunchEnd: 780 }
          : hour,
      );

      const saved = await asOwner()
        .patch('/settings/barbershop')
        .send({ businessHours: hours })
        .expect(200);

      const monday = saved.body.businessHours.find((h: { weekday: number }) => h.weekday === 1);
      expect(monday.lunchStart).toBe(720);
      expect(monday.lunchEnd).toBe(780);
    });

    it('recusa almoço fora do expediente, dizendo o dia', async () => {
      const current = await asOwner().get('/settings/barbershop').expect(200);
      const hours = current.body.businessHours.map((hour: { weekday: number }) =>
        // 07:00–08:00, antes de a casa abrir às 09:00.
        hour.weekday === 2 ? { ...hour, lunchStart: 420, lunchEnd: 480 } : hour,
      );

      const response = await asOwner()
        .patch('/settings/barbershop')
        .send({ businessHours: hours })
        .expect(400);

      expect(response.body.message).toContain('Ter');
      expect(response.body.message).toContain('fora do expediente');
    });

    it('recusa meio-almoço (só uma ponta)', async () => {
      const current = await asOwner().get('/settings/barbershop').expect(200);
      const hours = current.body.businessHours.map((hour: { weekday: number }) =>
        hour.weekday === 3 ? { ...hour, lunchStart: 720, lunchEnd: null } : hour,
      );

      await asOwner().patch('/settings/barbershop').send({ businessHours: hours }).expect(400);
    });

    it('recusa um fuso que o seletor da tela não oferece', async () => {
      await asOwner()
        .patch('/settings/barbershop')
        .send({ timezone: 'Marte/Olympus_Mons' })
        .expect(400);
    });
  });

  // ── Unidades ────────────────────────────────────────────────────────────

  describe('unidades', () => {
    it('a primeira unidade vira matriz e o status sai DERIVADO', async () => {
      const created = await asOwner()
        .post('/settings/units')
        .send({ name: 'Matriz (e2e cfg)', address: 'Rua Um, 1' })
        .expect(201);

      expect(created.body.isDefault).toBe(true);
      // Unidade nova, sem barbeiro nenhum: "Em configuração", como no desenho.
      expect(created.body.status).toBe('SETUP');
      expect(created.body.barberCount).toBe(0);
    });

    it('com barbeiro lotado, a unidade fica ATIVA', async () => {
      const units = await asOwner().get('/settings/units').expect(200);
      const unitId = units.body[0].id as string;

      await prisma.barber.update({ where: { id: ownerBarberId }, data: { unitId } });

      const after = await asOwner().get('/settings/units').expect(200);
      const unit = after.body.find((row: { id: string }) => row.id === unitId);
      expect(unit.barberCount).toBe(1);
      expect(unit.status).toBe('ACTIVE');
    });
  });

  // ── Papéis ──────────────────────────────────────────────────────────────

  describe('plano e cobrança são do dono', () => {
    it('o GERENTE não lê o plano, não simula a troca, não troca e não baixa fatura', async () => {
      await asManager().get('/settings/plan').expect(403);
      await asManager().get(`/settings/plan/preview/${essencialId}`).expect(403);
      await asManager().post('/settings/plan/change').send({ planId: essencialId }).expect(403);
      await asManager().get('/settings/plan/invoices/qualquer.pdf').expect(403);
    });

    it('mas o gerente continua dono da barbearia, das unidades e das preferências', async () => {
      await asManager().get('/settings/barbershop').expect(200);
      await asManager().get('/settings/units').expect(200);
      await asManager().get('/settings/preferences').expect(200);
    });
  });

  // ── Troca de plano ──────────────────────────────────────────────────────

  describe('ganhos e perdas da troca', () => {
    it('o preview do downgrade lista as features perdidas E os barbeiros que caem, por nome', async () => {
      const preview = await asOwner().get(`/settings/plan/preview/${essencialId}`).expect(200);

      expect(preview.body.isDowngrade).toBe(true);
      expect(preview.body.gained).toHaveLength(0);
      // Avançado → Essencial perde tudo que não é do tier 0.
      expect(preview.body.lost).toEqual(
        expect.arrayContaining(['Múltiplas unidades', 'Comissões automáticas']),
      );
      // O dono é barbeiro e nunca perde a vaga; sobra 1 assento para 3 colegas.
      expect(preview.body.barbersToDeactivate).toEqual(['Barbeiro Dois', 'Barbeiro Três']);
      expect(preview.body.lost[0]).toContain('Barbeiro Dois');
    });

    it('o preview do upgrade lista os ganhos e nenhuma perda', async () => {
      await changePlan(essencialId);
      const preview = await asOwner().get(`/settings/plan/preview/${avancadoId}`).expect(200);

      expect(preview.body.isDowngrade).toBe(false);
      expect(preview.body.lost).toHaveLength(0);
      expect(preview.body.gained).toEqual(
        expect.arrayContaining(['Barbeiros ilimitados', 'Múltiplas unidades']),
      );
    });

    it('recusa o preview do plano que já é o atual', async () => {
      const current = await asOwner().get('/settings/plan').expect(200);
      await asOwner().get(`/settings/plan/preview/${current.body.plan.id}`).expect(409);
    });

    it('a troca desliga os excedentes e o upgrade os traz de volta', async () => {
      // O caso anterior deixou o tenant no Essencial. Subir primeiro deixa a
      // ida e a volta explícitas — e a troca recusa repetir o plano atual.
      await changePlan(avancadoId);
      await changePlan(essencialId);
      const desligados = await prisma.barber.findMany({
        where: { tenantId, inactiveByPlan: true },
        select: { name: true },
        orderBy: { sortOrder: 'asc' },
      });
      expect(desligados.map((b) => b.name)).toEqual(['Barbeiro Dois', 'Barbeiro Três']);

      await changePlan(avancadoId);
      expect(await prisma.barber.count({ where: { tenantId, inactiveByPlan: true } })).toBe(0);
    });

    it('a troca passa pelo gateway: a fatura nasce com `externalId`', async () => {
      await changePlan(profissionalId);

      const invoice = await prisma.saasInvoice.findFirst({
        where: { tenantId },
        orderBy: { issuedAt: 'desc' },
        select: { externalId: true, status: true, amountCents: true },
      });

      expect(invoice?.externalId).toMatch(/^mock_/);
      expect(invoice?.status).toBe(SaasInvoiceStatus.PAID);
      expect(invoice?.amountCents).toBe(8_900);

      await changePlan(avancadoId);
    });

    it('recusa trocar para o plano que já está contratado', async () => {
      const current = await asOwner().get('/settings/plan').expect(200);
      await asOwner()
        .post('/settings/plan/change')
        .send({ planId: current.body.plan.id })
        .expect(409);
    });
  });

  // ── O que a aba Plano precisa mostrar ───────────────────────────────────

  describe('payload da aba Plano', () => {
    it('traz os bullets de marketing de cada plano — o card não é só nome e preço', async () => {
      const response = await asOwner().get('/settings/plan').expect(200);
      const option = response.body.availablePlans.find(
        (row: { id: string }) => row.id === avancadoId,
      );
      expect(option.marketing.features).toContain('Bullet de teste');
      expect(option.marketing.baseLabel).toBe('Tudo do anterior, mais:');
    });

    it('marca como "Atrasado" a fatura PENDENTE que passou do prazo', async () => {
      const subscription = await prisma.tenantSubscription.findFirstOrThrow({
        where: { tenantId },
        select: { id: true },
      });
      const old = await prisma.saasInvoice.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          amountCents: 13_900,
          status: SaasInvoiceStatus.PENDING,
          issuedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1_000),
        },
        select: { id: true },
      });

      const response = await asOwner().get('/settings/plan').expect(200);
      const row = response.body.invoices.find((item: { id: string }) => item.id === old.id);
      expect(row.overdue).toBe(true);

      const recent = response.body.invoices.find(
        (item: { id: string; status: string }) => item.status === 'PAID',
      );
      expect(recent.overdue).toBe(false);
    });
  });

  // ── Tenant recém-criado ─────────────────────────────────────────────────

  describe('barbearia nova — a aba tem de servir sem cair', () => {
    const novoSlug = `e2e-cfg-novo-${run}`;
    const novoEmail = `e2e-cfg-novo-${run}@barbervp.test`;
    let novoToken: string;

    beforeAll(async () => {
      // Nada de expediente, nada de assinatura, nada de unidade: exatamente o
      // que existe no minuto seguinte ao cadastro.
      const tenant = await prisma.tenant.create({
        data: { slug: novoSlug, name: 'Barbearia Nova (e2e cfg)', planId: essencialId },
        select: { id: true },
      });
      await prisma.user.create({
        data: {
          email: novoEmail,
          name: 'Dono Novo',
          passwordHash: await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
          memberships: { create: { tenantId: tenant.id, role: MembershipRole.OWNER } },
        },
      });
      const response = await api()
        .post(url('/auth/login'))
        .send({ email: novoEmail, password })
        .expect(200);
      novoToken = response.body.accessToken as string;
    });

    afterAll(async () => {
      await prisma.tenant.deleteMany({ where: { slug: novoSlug } });
    });

    it('as quatro sub-abas respondem 200, vazias', async () => {
      const barbershop = await as(novoToken).get('/settings/barbershop').expect(200);
      expect(barbershop.body.businessHours).toEqual([]);

      const units = await as(novoToken).get('/settings/units').expect(200);
      expect(units.body).toEqual([]);

      await as(novoToken).get('/settings/preferences').expect(200);
    });

    it('sem assinatura, `renewsAt` é NULO — a tela não anuncia renovação para hoje', async () => {
      const plan = await as(novoToken).get('/settings/plan').expect(200);
      expect(plan.body.renewsAt).toBeNull();
      expect(plan.body.invoices).toEqual([]);
      expect(plan.body.availablePlans.length).toBeGreaterThan(0);
    });
  });

  // ── Recibo ──────────────────────────────────────────────────────────────

  describe('o link "PDF" do histórico', () => {
    it('devolve um PDF de verdade, nomeado', async () => {
      const plan = await asOwner().get('/settings/plan').expect(200);
      const invoiceId = plan.body.invoices[0].id as string;

      const response = await asOwner()
        .get(`/settings/plan/invoices/${invoiceId}.pdf`)
        .expect(200)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('fatura-');
      expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('404 na fatura de OUTRA barbearia', async () => {
      const subscription = await prisma.tenantSubscription.create({
        data: {
          tenantId: otherTenantId,
          planId: avancadoId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        },
        select: { id: true },
      });
      const foreign = await prisma.saasInvoice.create({
        data: {
          tenantId: otherTenantId,
          subscriptionId: subscription.id,
          amountCents: 13_900,
          status: SaasInvoiceStatus.PAID,
        },
        select: { id: true },
      });

      await asOwner().get(`/settings/plan/invoices/${foreign.id}.pdf`).expect(404);
    });
  });

  // ── O expediente chega ao motor de disponibilidade ──────────────────────

  describe('o horário salvo aqui muda a grade pública', () => {
    /**
     * Próxima ocorrência de um dia da semana, no formato `YYYY-MM-DD`, sempre
     * a partir de AMANHÃ. Nunca hoje: a grade esconde horário no passado e a
     * antecedência mínima come o começo do dia — um teste que caísse em hoje
     * passaria ou falharia conforme a hora em que a suíte rodasse.
     */
    const nextWeekday = (weekday: number): string => {
      const date = new Date();
      date.setUTCHours(12, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() + 1);
      while (date.getUTCDay() !== weekday) {
        date.setUTCDate(date.getUTCDate() + 1);
      }
      return date.toISOString().slice(0, 10);
    };

    const availability = (date: string) =>
      api()
        .get(url(`/public/${slug}/availability`))
        .query({ serviceIds: serviceId, date });

    it('casa FECHADA zera o dia, mesmo com o barbeiro escalado', async () => {
      // Domingo (weekday 0) nasce `closed: true` no fixture e o barbeiro-dono
      // trabalha nos 7 dias. Antes do agente 26 o `closed` só desligava o
      // RECORTE pelo expediente, e o domingo continuava cheio de horário.
      const response = await availability(nextWeekday(0)).expect(200);
      expect(response.body.slots).toHaveLength(0);
    });

    it('o almoço DA CASA some da grade, independente do almoço do barbeiro', async () => {
      const target = nextWeekday(4); // quinta — sem almoço configurado ainda.
      const before = await availability(target).expect(200);
      expect(before.body.slots.map((s: { time: string }) => s.time)).toContain('12:00');

      const current = await asOwner().get('/settings/barbershop').expect(200);
      const hours = current.body.businessHours.map((hour: { weekday: number }) =>
        hour.weekday === 4 ? { ...hour, lunchStart: 720, lunchEnd: 780 } : hour,
      );
      await asOwner().patch('/settings/barbershop').send({ businessHours: hours }).expect(200);

      const after = await availability(target).expect(200);
      const times: string[] = after.body.slots.map((s: { time: string }) => s.time);
      expect(times).not.toContain('12:00');
      expect(times).not.toContain('12:30');
      expect(times).toContain('13:00');
      expect(times).toContain('11:30');
    });
  });

  // ── Preferências ────────────────────────────────────────────────────────

  describe('preferências', () => {
    it('grava a política e a devolve', async () => {
      const response = await asOwner()
        .patch('/settings/preferences')
        .send({ bloquearFaltasQtd: 2, antecedenciaMinima: 120, cancelamentoHoras: 12 })
        .expect(200);

      expect(response.body).toMatchObject({
        bloquearFaltasQtd: 2,
        antecedenciaMinima: 120,
        cancelamentoHoras: 12,
      });
    });

    it('recusa valores absurdos', async () => {
      await asOwner().patch('/settings/preferences').send({ bloquearFaltasQtd: 99 }).expect(400);
      await asOwner().patch('/settings/preferences').send({ cancelamentoHoras: 5_000 }).expect(400);
    });
  });
});
