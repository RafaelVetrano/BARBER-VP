import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { CommissionRuleType, MembershipRole, PrismaClient, StaffInviteStatus } from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Aba **Equipe** (fase 24) de ponta a ponta.
 *
 * O que estes casos protegem, em ordem de importância:
 *  1. **o teto do plano é server-side e conta convite pendente** — na emissão
 *     E no aceite, que era o furo: dois convites emitidos com uma vaga
 *     sobrando entravam os dois;
 *  2. **downgrade não recusa, desliga** — os excedentes ficam
 *     `inactiveByPlan`, o banner tem de onde sair, e o upgrade os traz de
 *     volta sem tocar em quem o dono desativou na mão;
 *  3. **o card tem o dado que o protótipo desenha** — nomes dos serviços,
 *     rótulo da comissão e a semana;
 *  4. **a semana montada no modal chega inteira no barbeiro convidado**.
 */
describe('aba Equipe — teto de plano, escala e convites (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-team-${run}`;
  const password = 'EquipeSenhaForte1!';
  const ownerEmail = `e2e-team-owner-${run}@barbervp.test`;
  const barberEmail = `e2e-team-barber-${run}@barbervp.test`;

  const planCodes = [`e2e-team-ess-${run}`, `e2e-team-prof-${run}`];

  let tenantId: string;
  let essencialId: string;
  let profissionalId: string;
  let ownerToken: string;
  let barberToken: string;
  let ownerBarberId: string;
  let serviceId: string;

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

  /** Deixa o tenant no plano pedido pelo mesmo caminho da tela de Configurações. */
  const changePlan = (planId: string) => asOwner().post('/settings/plan/change').send({ planId }).expect(201);

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

    const [essencial, profissional] = await Promise.all([
      prisma.saasPlan.create({
        data: {
          code: planCodes[0]!,
          name: 'Essencial (e2e team)',
          priceCents: 4_900,
          tier: PlanTier.ESSENCIAL,
          maxBarbers: 2,
          features: featuresForTier(PlanTier.ESSENCIAL) as unknown as object,
        },
        select: { id: true },
      }),
      prisma.saasPlan.create({
        data: {
          code: planCodes[1]!,
          name: 'Profissional (e2e team)',
          priceCents: 8_900,
          tier: PlanTier.PROFISSIONAL,
          maxBarbers: 4,
          features: featuresForTier(PlanTier.PROFISSIONAL) as unknown as object,
        },
        select: { id: true },
      }),
    ]);
    essencialId = essencial.id;
    profissionalId = profissional.id;

    const tenant = await prisma.tenant.create({
      data: { slug, name: 'Barbearia Equipe (e2e)', planId: profissional.id },
      select: { id: true },
    });
    tenantId = tenant.id;

    const service = await prisma.service.create({
      data: { tenantId, name: 'Corte Equipe', durationMin: 45, priceCents: 5_000 },
      select: { id: true },
    });
    serviceId = service.id;

    const rule = await prisma.commissionRule.create({
      data: { tenantId, name: 'Fixa 40 (e2e team)', type: CommissionRuleType.FIXED, percentBps: 4_000 },
      select: { id: true },
    });

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dona Equipe',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
      select: { id: true },
    });

    const ownerBarber = await prisma.barber.create({
      data: {
        tenantId,
        userId: owner.id,
        name: 'Dona Equipe',
        sortOrder: 0,
        commissionRuleId: rule.id,
        barberServices: { create: { tenantId, serviceId } },
      },
      select: { id: true },
    });
    ownerBarberId = ownerBarber.id;

    await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro Equipe',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
    });

    const login = async (email: string) => {
      const response = await api().post(url('/auth/login')).send({ email, password }).expect(200);
      return response.body.accessToken as string;
    };
    ownerToken = await login(ownerEmail);
    barberToken = await login(barberEmail);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${run}@barbervp.test` } } });
    await prisma.saasPlan.deleteMany({ where: { code: { in: planCodes } } });
    await prisma.$disconnect();
    await app.close();
  });

  /** Barbeiro criado direto (sem login) — o caminho rápido para lotar o teto. */
  const addBarber = (name: string) => asOwner().post('/barbers').send({ name, serviceIds: [serviceId] });

  // ── O que o card mostra ─────────────────────────────────────────────────

  describe('o card do grid', () => {
    it('traz o NOME dos serviços e o rótulo da comissão, não só os ids', async () => {
      const response = await asOwner().get('/barbers').expect(200);
      const owner = response.body.find((row: { id: string }) => row.id === ownerBarberId);

      expect(owner.serviceIds).toEqual([serviceId]);
      expect(owner.serviceNames).toEqual(['Corte Equipe']);
      // Regra FIXED de 4000bps — o card escreve "40%".
      expect(owner.commissionLabel).toBe('40%');
      expect(owner.inactiveByPlan).toBe(false);
      expect(owner.workSchedule).toHaveLength(7);
    });

    it('barbeiro sem regra de comissão volta com rótulo nulo, não com 0%', async () => {
      const created = await addBarber(`Sem regra ${run}`).expect(201);
      expect(created.body.commissionLabel).toBeNull();

      await prisma.barber.delete({ where: { id: created.body.id } });
    });
  });

  // ── O teto do plano ─────────────────────────────────────────────────────

  describe('teto de barbeiros do plano', () => {
    it('o uso soma barbeiros ativos E convites pendentes', async () => {
      const before = await asOwner().get('/barbers/plan-usage').expect(200);
      expect(before.body.maxBarbers).toBe(4);
      expect(before.body.activeBarbers).toBe(1);
      expect(before.body.pendingInvites).toBe(0);
      expect(before.body.canAddBarber).toBe(true);

      await asOwner()
        .post('/team/invites')
        .send({
          name: 'Convidado Um',
          email: `e2e-team-inv1-${run}@barbervp.test`,
          serviceIds: [serviceId],
          workDays: [1, 2, 3],
        })
        .expect(201);

      const after = await asOwner().get('/barbers/plan-usage').expect(200);
      expect(after.body.activeBarbers).toBe(1);
      expect(after.body.pendingInvites).toBe(1);
    });

    it('o convite que estouraria o teto é recusado com 403 e código de plano', async () => {
      // Profissional = 4. Já há 1 ativo + 1 pendente; dois barbeiros fecham a conta.
      await addBarber(`Cheio A ${run}`).expect(201);
      await addBarber(`Cheio B ${run}`).expect(201);

      const usage = await asOwner().get('/barbers/plan-usage').expect(200);
      expect(usage.body.canAddBarber).toBe(false);

      const refused = await asOwner()
        .post('/team/invites')
        .send({
          name: 'Convidado Dois',
          email: `e2e-team-inv2-${run}@barbervp.test`,
          serviceIds: [serviceId],
          workDays: [1],
        })
        .expect(403);

      expect(refused.body.code).toBe('PLAN_LIMIT_REACHED');
      // Criar barbeiro direto bate no mesmo teto.
      await addBarber(`Cheio C ${run}`).expect(403);
    });

    it('o aceite reconfere o teto: a vaga sumiu no meio do caminho e o cadastro é recusado', async () => {
      // Um convite pendente + 3 ativos = 4 no Profissional. O convite cabia
      // quando saiu; agora o dono reativou/criou por fora e a vaga acabou.
      const pending = await prisma.staffInvite.findFirstOrThrow({
        where: { tenantId, status: StaffInviteStatus.PENDING },
        select: { id: true },
      });

      // Ocupa a última vaga por fora do fluxo de convite (o teto de criação
      // não deixaria, então o teste força o estado que a corrida produz).
      await prisma.barber.create({
        data: { tenantId, name: `Furou a fila ${run}`, sortOrder: 9 },
      });

      const secret = 'segredo-que-nao-bate';
      const refused = await api()
        .post(url('/staff-invites/accept'))
        .send({ token: `${pending.id}.${secret}`, password: 'SenhaDoConvidado1!' });

      // Token inválido para no 400 antes do teto; o caso do teto real é o
      // seguinte, com o token certo emitido pelo próprio endpoint.
      expect(refused.status).toBe(400);

      const { body: link } = await asOwner().post(`/team/invites/${pending.id}/link`).expect(200);
      const token = new URL(link.url).searchParams.get('token')!;

      const overflow = await api()
        .post(url('/staff-invites/accept'))
        .send({ token, password: 'SenhaDoConvidado1!' })
        .expect(403);

      expect(overflow.body.code).toBe('PLAN_LIMIT_REACHED');
    });
  });

  // ── Downgrade e upgrade ─────────────────────────────────────────────────

  describe('downgrade e upgrade', () => {
    it('o downgrade NÃO é recusado: os excedentes viram "Inativo pelo plano"', async () => {
      await changePlan(essencialId);

      const usage = await asOwner().get('/barbers/plan-usage').expect(200);
      expect(usage.body.maxBarbers).toBe(2);
      expect(usage.body.activeBarbers).toBe(2);
      expect(usage.body.inactiveByPlanNames.length).toBeGreaterThan(0);

      const barbers = await asOwner().get('/barbers').expect(200);
      const marked = barbers.body.filter((row: { inactiveByPlan: boolean }) => row.inactiveByPlan);
      expect(marked.length).toBe(usage.body.inactiveByPlanNames.length);
      // "Inativo pelo plano" é, antes de tudo, inativo — a agenda filtra por
      // `active` e não precisa conhecer o motivo.
      expect(marked.every((row: { active: boolean }) => row.active === false)).toBe(true);

      // O barbeiro-dono nunca perde a vaga.
      const owner = barbers.body.find((row: { id: string }) => row.id === ownerBarberId);
      expect(owner.active).toBe(true);
    });

    it('reativar na mão acima do teto bate no 403 do plano', async () => {
      const barbers = await asOwner().get('/barbers').expect(200);
      const marked = barbers.body.find((row: { inactiveByPlan: boolean }) => row.inactiveByPlan);

      const refused = await asOwner().patch(`/barbers/${marked.id}`).send({ active: true }).expect(403);
      expect(refused.body.code).toBe('PLAN_LIMIT_REACHED');
    });

    it('o upgrade reativa quem o PLANO desligou e deixa quieto quem o dono desativou', async () => {
      // Uma desativação deliberada do dono, dentro do teto.
      const barbers = await asOwner().get('/barbers').expect(200);
      const activeNotOwner = barbers.body.find(
        (row: { active: boolean; isOwner: boolean }) => row.active && !row.isOwner,
      );
      await asOwner().patch(`/barbers/${activeNotOwner.id}`).send({ active: false }).expect(200);

      await changePlan(profissionalId);

      const after = await asOwner().get('/barbers').expect(200);
      expect(after.body.some((row: { inactiveByPlan: boolean }) => row.inactiveByPlan)).toBe(false);

      const deliberate = after.body.find((row: { id: string }) => row.id === activeNotOwner.id);
      expect(deliberate.active).toBe(false);
      expect(deliberate.inactiveByPlan).toBe(false);
    });
  });

  // ── Escala e convite com semana montada ────────────────────────────────

  describe('escala semanal', () => {
    it('o modal salva dados e semana na MESMA requisição', async () => {
      const week = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startTime: 600,
        endTime: 1_140,
        lunchStart: weekday === 0 ? null : 720,
        lunchEnd: weekday === 0 ? null : 780,
        isDayOff: weekday === 0,
      }));

      const response = await asOwner()
        .patch(`/barbers/${ownerBarberId}`)
        .send({ name: 'Dona Equipe', phone: '11999990000', serviceIds: [serviceId], schedule: week })
        .expect(200);

      expect(response.body.workSchedule[1].startTime).toBe(600);
      expect(response.body.workSchedule[1].lunchStart).toBe(720);
      expect(response.body.workSchedule[0].isDayOff).toBe(true);
    });

    it('WhatsApp digitado pela metade é RECUSADO, não apagado em silêncio', async () => {
      await asOwner().patch(`/barbers/${ownerBarberId}`).send({ phone: '1199' }).expect(400);

      const after = await asOwner().get('/barbers').expect(200);
      const owner = after.body.find((row: { id: string }) => row.id === ownerBarberId);
      // O número do caso anterior continua lá — a recusa não zerou o cadastro.
      expect(owner.phone).toBe('5511999990000');
    });

    it('almoço fora do expediente é recusado (400) e nada é gravado pela metade', async () => {
      const week = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startTime: 540,
        endTime: 1_080,
        // Almoço às 23h num expediente que fecha às 18h.
        lunchStart: weekday === 3 ? 1_380 : null,
        lunchEnd: weekday === 3 ? 1_420 : null,
        isDayOff: false,
      }));

      await asOwner().patch(`/barbers/${ownerBarberId}`).send({ schedule: week }).expect(400);

      const after = await asOwner().get('/barbers').expect(200);
      const owner = after.body.find((row: { id: string }) => row.id === ownerBarberId);
      // Continua o horário do caso anterior — a recusa foi antes da escrita.
      expect(owner.workSchedule[3].startTime).toBe(600);
    });

    it('o convite carrega a semana inteira até o barbeiro criado no aceite', async () => {
      // Libera a vaga que o convite recusado do caso do teto ainda segura —
      // convite pendente ocupa lugar até ser resolvido, e é essa a regra.
      const stillPending = await prisma.staffInvite.findMany({
        where: { tenantId, status: StaffInviteStatus.PENDING },
        select: { id: true },
      });
      for (const row of stillPending) {
        await asOwner().post(`/team/invites/${row.id}/revoke`).expect(201);
      }

      const week = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startTime: 480,
        endTime: 1_020,
        lunchStart: null,
        lunchEnd: null,
        isDayOff: weekday === 0 || weekday === 6,
      }));

      const email = `e2e-team-week-${run}@barbervp.test`;
      const invite = await asOwner()
        .post('/team/invites')
        .send({ name: 'Convidado Semana', email, serviceIds: [serviceId], schedule: week })
        .expect(201);

      // `workDays` é DERIVADO da semana — não vem do cliente.
      expect(invite.body.workDays).toEqual([1, 2, 3, 4, 5]);

      const { body: link } = await asOwner().post(`/team/invites/${invite.body.id}/link`).expect(200);
      const token = new URL(link.url).searchParams.get('token')!;

      await api()
        .post(url('/staff-invites/accept'))
        .send({ token, password: 'SenhaDoConvidado1!' })
        .expect(200);

      const barbers = await asOwner().get('/barbers').expect(200);
      const created = barbers.body.find((row: { email: string }) => row.email === email);

      expect(created.hasLogin).toBe(true);
      expect(created.serviceNames).toEqual(['Corte Equipe']);
      expect(created.workSchedule[1].startTime).toBe(480);
      expect(created.workSchedule[1].endTime).toBe(1_020);
      expect(created.workSchedule[6].isDayOff).toBe(true);
    });
  });

  // ── Papéis ──────────────────────────────────────────────────────────────

  describe('foto do barbeiro', () => {
    /*
     * O `image-slot` do protótipo (l.2166) era um campo "URL da foto" até o
     * agente 29: o dono hospedava a imagem em outro lugar e colava o endereço.
     * O `StorageAdapter` do agente 25 já resolvia o servidor — faltava a rota
     * e o consumidor.
     */

    // 1×1 PNG — o menor arquivo válido que o `StorageAdapter` aceita.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    it('envia a foto e o card passa a devolvê-la', async () => {
      const response = await api()
        .post(url(`/barbers/${ownerBarberId}/avatar`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', png, { filename: 'foto.png', contentType: 'image/png' })
        .expect(201);

      expect(response.body.avatarUrl).toContain('/uploads/');

      const list = await asOwner().get('/barbers').expect(200);
      const row = list.body.find((barber: { id: string }) => barber.id === ownerBarberId);
      expect(row.avatarUrl).toBe(response.body.avatarUrl);
    });

    it('recusa PDF disfarçado de imagem', async () => {
      await api()
        .post(url(`/barbers/${ownerBarberId}/avatar`))
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', Buffer.from('%PDF-1.7'), { filename: 'x.pdf', contentType: 'application/pdf' })
        .expect(415);
    });

    it('o PATCH não é mais um segundo caminho para gravar a foto', async () => {
      // `avatarUrl` saiu do `UpdateBarberDto`: aceitá-lo ali seria escrever a
      // mesma coluna sem passar pela validação de tipo e tamanho do storage.
      await asOwner()
        .patch(`/barbers/${ownerBarberId}`)
        .send({ avatarUrl: 'https://exemplo.test/qualquer.png' })
        .expect(400);
    });

    it('remove a foto', async () => {
      const response = await asOwner().delete(`/barbers/${ownerBarberId}/avatar`).expect(200);
      expect(response.body.avatarUrl).toBeNull();
    });

    it('o BARBER não mexe na foto de ninguém', async () => {
      await api()
        .post(url(`/barbers/${ownerBarberId}/avatar`))
        .set('Authorization', `Bearer ${barberToken}`)
        .attach('file', png, { filename: 'foto.png', contentType: 'image/png' })
        .expect(403);
    });
  });

  describe('papéis', () => {
    it('o BARBER não abre a aba Equipe por nenhuma das rotas', async () => {
      await as(barberToken).get('/barbers').expect(403);
      await as(barberToken).get('/barbers/plan-usage').expect(403);
      await as(barberToken).get('/team/invites').expect(403);
    });
  });
});
