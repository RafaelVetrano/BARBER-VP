import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PlanTier, featuresForTier, normalizeMobilePhone } from '@barbervp/types';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Os TRÊS fluxos críticos do critério de aceite da fase 09.
 *
 * As suítes anteriores testam cada fase por dentro; esta atravessa o produto
 * inteiro pelas junções, que é onde as fases se encontram e onde ninguém
 * olhou até agora:
 *
 *   1. Barbearia: cadastro → onboarding → primeiro serviço → agendamento
 *      público (com corrida de slot) → comanda → fechamento → comissão →
 *      relatório refletindo o valor.
 *   2. Cliente: registro com OTP → assinar plano → agendar serviço coberto →
 *      uso decrementa → exportação LGPD.
 *   3. Super admin: troca o plano do tenant → o feature gate do dashboard
 *      daquele tenant muda na hora.
 *
 * Nada de atalho: os tokens saem de login de verdade, o OTP é lido de onde o
 * driver mock grava, e os valores conferidos no fim vêm da API de relatório,
 * não do banco.
 */
describe('fluxos críticos (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-9);
  const password = 'FluxoCritico2026';

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const bearer = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${token}`),
    put: (path: string) => api().put(url(path)).set('Authorization', `Bearer ${token}`),
  });

  /** Dia de trabalho suficientemente à frente para caber na antecedência mínima. */
  const targetDate = (() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 3);
    return date.toISOString().slice(0, 10);
  })();

  /**
   * Primeiro horário livre da grade pública.
   *
   * A rota devolve os `slots` do dia pedido e, quando ele não tem vaga,
   * `nextAvailableDate` — seguir esse ponteiro uma vez basta para as
   * barbearias destes fluxos, que abrem os sete dias.
   */
  const firstSlot = async (
    slug: string,
    serviceIds: string[],
    barberId: string,
  ): Promise<{ startsAt: string }> => {
    const ask = (date: string) =>
      api()
        .get(url(`/public/${slug}/availability`))
        .query({ serviceIds: serviceIds.join(','), date, barberId })
        .expect(200);

    let response = await ask(targetDate);
    if (!response.body.slots?.length && response.body.nextAvailableDate) {
      response = await ask(response.body.nextAvailableDate);
    }

    const slot = response.body.slots?.[0];
    if (!slot) {
      throw new Error(`Nenhum horário livre em ${slug} a partir de ${targetDate}`);
    }
    return slot as { startsAt: string };
  };

  const lastOtpFor = async (destination: string): Promise<string> => {
    const outbox = await prisma.notificationOutbox.findFirst({
      where: { recipient: destination },
      orderBy: { createdAt: 'desc' },
      select: { body: true },
    });
    const code = /\b(\d{6})\b/.exec(outbox?.body ?? '')?.[1];
    if (!code) {
      throw new Error(`Nenhum OTP encontrado no outbox para ${destination}`);
    }
    return code;
  };

  /** Ids criados fora de um tenant — limpos à mão no teardown. */
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdPlanIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.saasPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FLUXO 1 — a barbearia, do cadastro ao relatório
  // ═══════════════════════════════════════════════════════════════════════

  describe('fluxo 1 — cadastro → onboarding → agendamento → comanda → comissão → relatório', () => {
    const ownerEmail = `dono-fluxo1-${run}@barbervp.test`;
    const slug = `fluxo1-${run}`;

    let ownerToken: string;
    let tenantId: string;
    let serviceId: string;
    let barberId: string;
    let servicePriceCents: number;
    let bookingCode: string;
    let appointmentId: string;
    let orderId: string;

    it('1.1 — cadastra o estabelecimento e recebe sessão de OWNER', async () => {
      const response = await api()
        .post(url('/auth/register'))
        .send({
          name: 'Dono do Fluxo Um',
          phone: `11${run.slice(0, 9)}`.slice(0, 11),
          email: ownerEmail,
          password,
          shopName: `Barbearia Fluxo Um ${run}`,
          acceptTerms: true,
        })
        .expect(201);

      ownerToken = response.body.accessToken;
      tenantId = response.body.memberships[0].tenantId;

      expect(ownerToken).toEqual(expect.any(String));
      expect(response.body.memberships[0].role).toBe(MembershipRole.OWNER);
      expect(response.body.memberships[0].onboardingDone).toBe(false);

      createdTenantIds.push(tenantId);
      createdUserIds.push(response.body.user.id);

      // O registro nasce com TRIAL e já com o barbeiro do dono — é o que
      // permite que o passo seguinte tenha a quem vincular o serviço.
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(tenant.status).toBe('TRIAL');
    });

    it('1.2 — percorre o onboarding até o fim', async () => {
      const owner = bearer(ownerToken);

      await owner
        .put('/onboarding/profile')
        .send({ name: `Barbearia Fluxo Um ${run}`, phone: '1133224455' })
        .expect(200);

      await owner
        .put('/onboarding/location')
        .send({
          zip: '01310100',
          street: 'Avenida Paulista',
          number: '1000',
          city: 'São Paulo',
          state: 'SP',
        })
        .expect(200);

      await owner.put('/onboarding/identity').send({ slug }).expect(200);

      await owner
        .put('/onboarding/services')
        .send({
          services: [{ name: 'Corte Masculino', durationMin: 45, priceCents: 4_500 }],
        })
        .expect(200);

      await owner
        .put('/onboarding/business-hours')
        .send({
          hours: Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            opensAt: 0,
            closesAt: 1_440,
            closed: false,
          })),
        })
        .expect(200);

      await owner.post('/onboarding/complete').expect(200);

      const state = await owner.get('/onboarding').expect(200);
      expect(state.body.completed).toBe(true);
    });

    it('1.3 — o primeiro serviço cadastrado aparece na página pública', async () => {
      const services = await bearer(ownerToken).get('/services').expect(200);
      const corte = services.body.data.find(
        (item: { name: string }) => item.name === 'Corte Masculino',
      );
      expect(corte).toBeDefined();
      serviceId = corte.id;
      servicePriceCents = corte.priceCents;

      const barbers = await bearer(ownerToken).get('/barbers').expect(200);
      barberId = barbers.body[0].id;

      // A página pública é anônima — é assim que o cliente final a vê.
      const page = await api().get(url(`/public/${slug}`)).expect(200);
      expect(page.body.services.map((s: { id: string }) => s.id)).toContain(serviceId);
    });

    it('1.3b — contrata o plano e configura a comissão do barbeiro', async () => {
      // A contratação do plano do SaaS é do fluxo de billing (fase 08) e não
      // tem rota no painel da barbearia — aqui ela é só o pré-requisito para
      // que Comissões deixe de responder 403 por feature gate.
      const saasPlan = await prisma.saasPlan.create({
        data: {
          code: `fluxo1-avancado-${run}`,
          name: 'Avançado (fluxo 1)',
          priceCents: 13_900,
          tier: PlanTier.AVANCADO,
          features: featuresForTier(PlanTier.AVANCADO) as object,
        },
        select: { id: true },
      });
      createdPlanIds.push(saasPlan.id);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { planId: saasPlan.id, status: 'ACTIVE' },
      });

      // 40% para o barbeiro — a regra que o fechamento vai aplicar.
      await bearer(ownerToken)
        .post('/commissions/rules')
        .send({
          name: 'Padrão da casa',
          type: 'FIXED',
          percentBps: 4_000,
          barberIds: [barberId],
        })
        .expect(201);
    });

    it('1.4 — agendamento público, com corrida de slot: só um vence', async () => {
      const { startsAt } = await firstSlot(slug, [serviceId], barberId);

      const attempt = (suffix: string) =>
        api()
          .post(url(`/public/${slug}/appointments`))
          .send({
            serviceIds: [serviceId],
            barberId,
            startsAt,
            guestName: `Cliente ${suffix}`,
            guestPhone: `1197${run.slice(0, 3)}${suffix}`.slice(0, 11),
          });

      const [first, second] = await Promise.all([attempt('4001'), attempt('4002')]);
      expect([first.status, second.status].sort()).toEqual([201, 409]);

      const winner = first.status === 201 ? first : second;
      const loser = first.status === 409 ? first : second;

      expect(loser.body.code).toBe('DOUBLE_BOOKING');
      expect(winner.body.kind).toBe('confirmed');
      bookingCode = winner.body.appointment.bookingCode;
      expect(bookingCode).toEqual(expect.any(String));

      // E o banco confirma: exatamente UM atendimento ativo naquele instante.
      const booked = await prisma.appointment.count({
        where: {
          tenantId,
          barberId,
          startsAt: new Date(startsAt),
          status: { notIn: ['CANCELED', 'NO_SHOW'] },
        },
      });
      expect(booked).toBe(1);

      const appointment = await prisma.appointment.findFirstOrThrow({
        where: { tenantId, bookingCode },
      });
      appointmentId = appointment.id;
    });

    it('1.5 — abre a comanda do agendamento e lança o serviço', async () => {
      const owner = bearer(ownerToken);

      const order = await owner.post('/orders').send({ appointmentId }).expect(201);
      orderId = order.body.id;

      await owner
        .post(`/orders/${orderId}/items`)
        .send({ kind: 'SERVICE', serviceId, quantity: 1 })
        .expect(201);

      const loaded = await owner.get(`/orders/${orderId}`).expect(200);
      expect(loaded.body.totalCents).toBe(servicePriceCents);
    });

    it('1.6 — fecha a comanda e o agendamento vira DONE', async () => {
      await bearer(ownerToken)
        .post(`/orders/${orderId}/close`)
        .send({ payments: [{ method: 'CASH', amountCents: servicePriceCents }] })
        .expect(201);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('CLOSED');

      const appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
      });
      expect(appointment.status).toBe('DONE');
    });

    it('1.7 — a comissão do barbeiro foi gerada pelo fechamento', async () => {
      const entries = await prisma.commissionEntry.findMany({
        where: { tenantId, barberId },
      });

      expect(entries.length).toBeGreaterThanOrEqual(1);

      // 40% do serviço, que é a regra criada em 1.3b — o valor tem de bater,
      // não só existir.
      const total = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
      expect(total).toBe(Math.round(servicePriceCents * 0.4));
    });

    it('1.8 — o relatório reflete o valor faturado', async () => {
      const summary = await bearer(ownerToken).get('/reports/summary').expect(200);

      // O valor tem de vir da API, não do banco: é o número que o dono vê.
      expect(summary.body.revenueCents).toBe(servicePriceCents);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FLUXO 2 — o cliente, do OTP à exportação LGPD
  // ═══════════════════════════════════════════════════════════════════════

  describe('fluxo 2 — registro OTP → assinatura → agendamento coberto → uso decrementa → LGPD', () => {
    const slug = `fluxo2-${run}`;
    const clientPhone = `1198${run.slice(0, 7)}`.slice(0, 11);
    const clientEmail = `cliente-fluxo2-${run}@barbervp.test`;

    let tenantId: string;
    let serviceId: string;
    let barberId: string;
    let planId: string;
    let clientToken: string;
    let clientId: string;
    let clientBookingCode: string;

    beforeAll(async () => {
      // A barbearia deste fluxo é montada direto no banco: o caminho de
      // cadastro dela já é o fluxo 1, e repeti-lo aqui só tornaria o teste
      // mais lento sem cobrir nada novo.
      const saasPlan = await prisma.saasPlan.create({
        data: {
          code: `fluxo2-avancado-${run}`,
          name: 'Avançado (fluxo 2)',
          priceCents: 13_900,
          tier: PlanTier.AVANCADO,
          features: featuresForTier(PlanTier.AVANCADO) as object,
        },
        select: { id: true },
      });
      createdPlanIds.push(saasPlan.id);

      const tenant = await prisma.tenant.create({
        data: {
          slug,
          name: `Barbearia Fluxo Dois ${run}`,
          planId: saasPlan.id,
          settings: { create: { allowOnlineBooking: true } },
          businessHours: {
            create: Array.from({ length: 7 }, (_, weekday) => ({
              weekday,
              opensAt: 0,
              closesAt: 1_440,
              closed: false,
            })),
          },
        },
        select: { id: true },
      });
      tenantId = tenant.id;
      createdTenantIds.push(tenantId);

      const service = await prisma.service.create({
        data: { tenantId, name: 'Corte Masculino', durationMin: 45, priceCents: 4_500 },
        select: { id: true },
      });
      serviceId = service.id;

      const barber = await prisma.barber.create({
        data: {
          tenantId,
          name: 'Carlos Silva',
          // Sem escala, a grade não oferece horário nenhum: o expediente da
          // barbearia diz quando a porta está aberta, a escala diz quando
          // ESTE profissional atende.
          workSchedules: {
            create: Array.from({ length: 7 }, (_, weekday) => ({
              tenantId,
              weekday,
              startTime: 9 * 60,
              endTime: 20 * 60,
              isDayOff: false,
            })),
          },
        },
        select: { id: true },
      });
      barberId = barber.id;

      await prisma.barberService.create({ data: { tenantId, barberId, serviceId } });

      const plan = await prisma.clientPlan.create({
        data: {
          tenantId,
          name: 'Corte Semanal',
          priceCents: 12_000,
          billingDay: 5,
          items: { create: [{ tenantId, serviceId, quota: 4 }] },
        },
        select: { id: true },
      });
      planId = plan.id;
    });

    it('2.1 — registra o cliente e confirma pelo OTP', async () => {
      const register = await api()
        .post(url('/client-auth/register'))
        .send({
          firstName: 'Marina',
          lastName: 'Fluxo',
          phone: clientPhone,
          email: clientEmail,
          confirmEmail: clientEmail,
          password,
          confirmPassword: password,
          acceptTerms: true,
        })
        .expect(202);

      const phoneE164 = normalizeMobilePhone(clientPhone)!;
      const code = await lastOtpFor(phoneE164);

      const verify = await api()
        .post(url('/client-auth/otp/verify'))
        .send({ challengeId: register.body.challengeId, code })
        .expect(200);

      clientToken = verify.body.session.accessToken;
      clientId = verify.body.session.client.id;
      createdClientIds.push(clientId);

      expect(clientToken).toEqual(expect.any(String));
    });

    it('2.2 — assina o plano e a quota nasce zerada', async () => {
      const response = await bearer(clientToken)
        .post(`/public/${slug}/account/subscription`)
        .send({ planId, paymentMethod: 'PIX' })
        .expect(201);

      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.usages).toEqual([
        expect.objectContaining({ serviceId, quota: 4, used: 0 }),
      ]);
    });

    it('2.3 — agenda um serviço coberto e o uso decrementa', async () => {
      const { startsAt } = await firstSlot(slug, [serviceId], barberId);

      const booking = await bearer(clientToken)
        .post(`/public/${slug}/appointments`)
        .send({ serviceIds: [serviceId], barberId, startsAt })
        .expect(201);

      expect(booking.body.kind).toBe('confirmed');
      clientBookingCode = booking.body.appointment.bookingCode;
      expect(clientBookingCode).toEqual(expect.any(String));

      const subscription = await bearer(clientToken)
        .get(`/public/${slug}/account/subscription`)
        .expect(200);

      const usage = subscription.body.subscription.usages.find(
        (item: { serviceId: string }) => item.serviceId === serviceId,
      );
      expect(usage.used).toBe(1);
      expect(usage.quota).toBe(4);

      // O agendamento carrega o vínculo com o uso — é ele que permite
      // estornar a quota se o cliente cancelar.
      const appointment = await prisma.appointment.findFirstOrThrow({
        where: { tenantId, bookingCode: clientBookingCode },
      });
      expect(appointment.subscriptionUsageId).not.toBeNull();
    });

    it('2.4 — exporta os próprios dados (LGPD) com o agendamento dentro', async () => {
      const response = await bearer(clientToken).get('/client-auth/me/export').expect(200);

      expect(response.body.profile.id).toBe(clientId);
      expect(response.body.exportedAt).toEqual(expect.any(String));

      // O agendamento do passo anterior tem de estar na exportação: é
      // justamente o dado que a LGPD dá ao titular o direito de levar.
      expect(response.body.appointments).toContainEqual(
        expect.objectContaining({
          bookingCode: clientBookingCode,
          services: ['Corte Masculino'],
        }),
      );

      // E a assinatura que ele contratou, com o nome do plano.
      expect(response.body.subscriptions).toContainEqual(
        expect.objectContaining({ planName: 'Corte Semanal' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FLUXO 3 — super admin muda o plano, o gate do tenant muda junto
  // ═══════════════════════════════════════════════════════════════════════

  describe('fluxo 3 — super admin troca o plano e o feature gate reflete na hora', () => {
    const slug = `fluxo3-${run}`;
    const superEmail = `super-fluxo3-${run}@barbervp.test`;
    const ownerEmail = `dono-fluxo3-${run}@barbervp.test`;

    let superToken: string;
    let ownerToken: string;
    let tenantId: string;
    let essencialId: string;
    let avancadoId: string;

    beforeAll(async () => {
      const passwordHash = await hash(password, {
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });

      const [essencial, avancado] = await Promise.all([
        prisma.saasPlan.create({
          data: {
            code: `fluxo3-essencial-${run}`,
            name: 'Essencial (fluxo 3)',
            priceCents: 4_900,
            tier: PlanTier.ESSENCIAL,
            maxBarbers: 2,
            features: featuresForTier(PlanTier.ESSENCIAL) as object,
          },
          select: { id: true },
        }),
        prisma.saasPlan.create({
          data: {
            code: `fluxo3-avancado-${run}`,
            name: 'Avançado (fluxo 3)',
            priceCents: 13_900,
            tier: PlanTier.AVANCADO,
            features: featuresForTier(PlanTier.AVANCADO) as object,
          },
          select: { id: true },
        }),
      ]);
      essencialId = essencial.id;
      avancadoId = avancado.id;
      createdPlanIds.push(essencialId, avancadoId);

      const tenant = await prisma.tenant.create({
        data: {
          slug,
          name: `Barbearia Fluxo Três ${run}`,
          planId: essencialId,
          settings: { create: {} },
        },
        select: { id: true },
      });
      tenantId = tenant.id;
      createdTenantIds.push(tenantId);

      const superAdmin = await prisma.user.create({
        data: { email: superEmail, name: 'Super Fluxo', passwordHash, isSuperAdmin: true },
        select: { id: true },
      });
      const owner = await prisma.user.create({
        data: {
          email: ownerEmail,
          name: 'Dono Fluxo Três',
          passwordHash,
          memberships: { create: { tenantId, role: MembershipRole.OWNER } },
        },
        select: { id: true },
      });
      createdUserIds.push(superAdmin.id, owner.id);

      const [superLogin, ownerLogin] = await Promise.all([
        api().post(url('/auth/login')).send({ email: superEmail, password }).expect(200),
        api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200),
      ]);
      superToken = superLogin.body.accessToken;
      ownerToken = ownerLogin.body.accessToken;
    });

    it('3.1 — no Essencial, o dono toma 403 numa feature de tier superior', async () => {
      const response = await bearer(ownerToken).get('/commissions/rules');

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FEATURE_NOT_IN_PLAN');
    });

    it('3.2 — o super admin troca o plano do tenant para Avançado', async () => {
      await bearer(superToken)
        .patch(`/admin/tenants/${tenantId}/plan`)
        .send({ planId: avancadoId })
        .expect(200);

      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(tenant.planId).toBe(avancadoId);
    });

    it('3.3 — a MESMA rota passa a responder 200, com o MESMO token', async () => {
      // Sem novo login: o gate é resolvido por requisição, contra o plano
      // atual do tenant — não é algo carimbado no JWT.
      await bearer(ownerToken).get('/commissions/rules').expect(200);
    });

    it('3.4 — voltar para o Essencial fecha a porta de novo', async () => {
      await bearer(superToken)
        .patch(`/admin/tenants/${tenantId}/plan`)
        .send({ planId: essencialId })
        .expect(200);

      const response = await bearer(ownerToken).get('/commissions/rules');
      expect(response.status).toBe(403);
    });
  });
});
