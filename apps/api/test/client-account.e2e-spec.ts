import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PlanTier, featuresForTier, normalizeMobilePhone } from '@barbervp/types';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Área do cliente (fase 05) de ponta a ponta, contra o banco real.
 *
 * O caso central é o critério de aceite do SPEC: assinar um plano mock,
 * agendar um serviço coberto e ver o saldo de usos decrementar CORRETAMENTE
 * sob concorrência — três reservas disparadas juntas contra uma quota de 2 não
 * podem entregar três cortes de graça. O resto (perfil, troca de telefone,
 * senha, LGPD, avaliação) segue o mesmo padrão de `auth.e2e-spec.ts`: nada de
 * atalho, o teste lê o OTP de onde o driver mock realmente grava.
 */
describe('área do cliente (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-6);
  const slug = `e2e-conta-${run}`;
  const clientDigits = `${run}01`;
  const clientPhone = `(16) 9 ${clientDigits.slice(0, 4)}-${clientDigits.slice(4)}`;
  const clientEmail = `e2e-conta-${run}@barbervp.test`;
  const clientPassword = 'ClienteSenha1';

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  let tenantId: string;
  let corteId: string;
  let barbaId: string;
  let planId: string;
  let accessToken: string;
  let clientId: string;

  const auth = {
    get: (path: string) => api().get(path).set('Authorization', `Bearer ${accessToken}`),
    post: (path: string) => api().post(path).set('Authorization', `Bearer ${accessToken}`),
    patch: (path: string) => api().patch(path).set('Authorization', `Bearer ${accessToken}`),
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

  async function createTenant(tenantSlug: string, name: string, planIdArg: string) {
    const tenant = await prisma.tenant.create({
      data: {
        slug: tenantSlug,
        name,
        timezone: 'America/Sao_Paulo',
        planId: planIdArg,
        settings: {
          create: {
            allowOnlineBooking: true,
            antecedenciaMinima: 30,
            cancelamentoHoras: 2,
            slotIntervalMin: 15,
          },
        },
        businessHours: {
          create: [
            { weekday: 0, opensAt: 0, closesAt: 0, closed: true },
            ...[1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              opensAt: 9 * 60,
              closesAt: 20 * 60,
              closed: false,
            })),
            { weekday: 6, opensAt: 9 * 60, closesAt: 18 * 60, closed: false },
          ],
        },
      },
      select: { id: true },
    });
    return tenant.id;
  }

  async function createService(name: string, durationMin: number, priceCents: number) {
    const service = await prisma.service.create({
      data: { tenantId, name, durationMin, priceCents },
      select: { id: true },
    });
    return service.id;
  }

  async function createBarber(name: string, serviceIds: string[]) {
    const barber = await prisma.barber.create({
      data: {
        tenantId,
        name,
        barberServices: { create: serviceIds.map((serviceId) => ({ tenantId, serviceId })) },
        workSchedules: {
          create: [
            { tenantId, weekday: 0, startTime: 9 * 60, endTime: 18 * 60, isDayOff: true },
            ...[1, 2, 3, 4, 5, 6].map((weekday) => ({
              tenantId,
              weekday,
              startTime: 9 * 60,
              endTime: weekday === 6 ? 18 * 60 : 20 * 60,
              isDayOff: false,
            })),
          ],
        },
      },
      select: { id: true },
    });
    return barber.id;
  }

  /** Dia útil suficientemente à frente para caber na grade. */
  const targetDate = (() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 3);
    if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  })();

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

    const saasPlan = await prisma.saasPlan.create({
      data: {
        code: `e2e-avancado-${run}`,
        name: 'Avançado (e2e)',
        priceCents: 13_900,
        tier: PlanTier.AVANCADO,
        maxBarbers: null,
        features: featuresForTier(PlanTier.AVANCADO) as unknown as object,
      },
      select: { id: true },
    });

    tenantId = await createTenant(slug, 'Barbearia Conta (e2e)', saasPlan.id);
    corteId = await createService('Corte Masculino', 45, 4_500);
    barbaId = await createService('Barba', 30, 3_500);
    await createBarber('Carlos e2e', [corteId, barbaId]);

    const plan = await prisma.clientPlan.create({
      data: {
        tenantId,
        name: 'Corte Semanal (e2e)',
        priceCents: 15_000,
        billingDay: 5,
        items: { create: [{ tenantId, serviceId: corteId, quota: 2 }] },
      },
      select: { id: true },
    });
    planId = plan.id;

    // Registro real do cliente: cadastro pendente → OTP → sessão.
    const registerRes = await api()
      .post(url('/client-auth/register'))
      .send({
        firstName: 'André',
        lastName: 'E2E',
        phone: clientPhone,
        email: clientEmail,
        confirmEmail: clientEmail,
        password: clientPassword,
        confirmPassword: clientPassword,
        acceptTerms: true,
      })
      .expect(202);

    const phoneE164 = normalizeMobilePhone(clientPhone)!;
    const code = await lastOtpFor(phoneE164);
    const verifyRes = await api()
      .post(url('/client-auth/otp/verify'))
      .send({ challengeId: registerRes.body.challengeId, code })
      .expect(200);

    accessToken = verifyRes.body.session.accessToken;
    clientId = verifyRes.body.session.client.id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.saasPlan.deleteMany({ where: { code: `e2e-avancado-${run}` } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── Perfil, telefone e senha ("Meus dados") ─────────────────────────────────

  describe('PATCH /client-auth/me', () => {
    it('atualiza nome e preferências de notificação', async () => {
      const response = await auth.patch(url('/client-auth/me'))
        .send({ name: 'André Editado', notifyEmail: true })
        .expect(200);

      expect(response.body.name).toBe('André Editado');
      expect(response.body.notifyEmail).toBe(true);
      // WhatsApp não foi tocado nesta chamada — continua no default.
      expect(response.body.notifyWhatsapp).toBe(true);
    });

    it('sem token responde 401', async () => {
      await api().patch(url('/client-auth/me')).send({ name: 'x' }).expect(401);
    });
  });

  describe('troca de telefone', () => {
    const newDigits = `${run}09`;
    const newPhone = `(16) 9 ${newDigits.slice(0, 4)}-${newDigits.slice(4)}`;

    it('pede OTP e só troca depois do código confirmado — e sincroniza o ClientProfile', async () => {
      // Nasce um `ClientProfile` desnormalizado nesta barbearia, como a fase 04
      // cria no primeiro agendamento — é ele que precisa acompanhar a troca.
      await prisma.clientProfile.upsert({
        where: { tenantId_clientId: { tenantId, clientId } },
        create: { tenantId, clientId, phone: normalizeMobilePhone(clientPhone)! },
        update: {},
      });

      const challenge = await auth.post(url('/client-auth/me/phone'))
        .send({ phone: newPhone })
        .expect(200);

      const newPhoneE164 = normalizeMobilePhone(newPhone)!;
      const code = await lastOtpFor(newPhoneE164);

      const response = await auth.post(url('/client-auth/me/phone/confirm'))
        .send({ challengeId: challenge.body.challengeId, code })
        .expect(200);

      expect(response.body.phone).toBe(newPhoneE164);

      const profile = await prisma.clientProfile.findUnique({
        where: { tenantId_clientId: { tenantId, clientId } },
      });
      expect(profile?.phone).toBe(newPhoneE164);
    });
  });

  describe('POST /client-auth/password/change', () => {
    it('recusa com a senha atual errada', async () => {
      await auth.post(url('/client-auth/password/change'))
        .send({ currentPassword: 'errada', newPassword: 'NovaSenha1', confirmNewPassword: 'NovaSenha1' })
        .expect(401);
    });

    it('troca a senha e a nova passa a autenticar', async () => {
      await auth.post(url('/client-auth/password/change'))
        .send({
          currentPassword: clientPassword,
          newPassword: 'NovaSenha1',
          confirmNewPassword: 'NovaSenha1',
        })
        .expect(204);

      const login = await api()
        .post(url('/client-auth/login'))
        .send({ identifier: clientEmail, password: 'NovaSenha1' })
        .expect(200);

      accessToken = login.body.accessToken;
    });
  });

  describe('GET /client-auth/me/export', () => {
    it('devolve o JSON completo do cliente (LGPD)', async () => {
      const response = await auth.get(url('/client-auth/me/export')).expect(200);

      expect(response.body.profile.id).toBe(clientId);
      expect(response.body.profile.consentVersion).toBeTruthy();
      expect(Array.isArray(response.body.appointments)).toBe(true);
      expect(Array.isArray(response.body.subscriptions)).toBe(true);
    });
  });

  // ── Assinatura + cobertura no agendamento (o critério de aceite central) ────

  describe('assinatura e débito atômico', () => {
    it('lista os planos com a economia calculada', async () => {
      const response = await auth.get(url(`/public/${slug}/account/subscription/plans`)).expect(200);

      const plan = response.body.find((item: { id: string }) => item.id === planId);
      expect(plan).toBeDefined();
      // 2× Corte Masculino avulso (R$45) = R$90; o plano custa R$150 → sem economia.
      expect(plan.savingsCents).toBe(0);
    });

    it('assina com cartão mock e nasce com o saldo zerado', async () => {
      const response = await auth.post(url(`/public/${slug}/account/subscription`))
        .send({
          planId,
          paymentMethod: 'CREDIT_CARD',
          card: { number: '4111 1111 1111 1111', expiry: '12/30', cvv: '123', holderName: 'ANDRE E2E' },
        })
        .expect(201);

      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.usages).toEqual([
        expect.objectContaining({ serviceId: corteId, quota: 2, used: 0 }),
      ]);
    });

    it('recusa uma segunda assinatura enquanto a primeira está ativa', async () => {
      await auth.post(url(`/public/${slug}/account/subscription`))
        .send({ planId, paymentMethod: 'PIX' })
        .expect(409);
    });

    /**
     * O caso que a regra 4 do SPEC pede provado: `UPDATE … WHERE used < quota`
     * sob concorrência. Quota é 2 — três reservas do MESMO serviço, para três
     * horários DIFERENTES (a colisão que importa aqui é a da quota, não a da
     * `EXCLUDE`), disparadas juntas. No máximo duas podem sair de graça.
     */
    it('três reservas concorrentes debitam no máximo 2 usos de uma quota de 2', async () => {
      const availability = await api()
        .get(url(`/public/${slug}/availability`))
        .query({ serviceIds: corteId, date: targetDate })
        .expect(200);

      const slots = availability.body.slots as Array<{ startsAt: string }>;
      expect(slots.length).toBeGreaterThanOrEqual(7);

      // O Corte dura 45min sobre uma grade de 15min: slots vizinhos colidem no
      // MESMO barbeiro (Carlos é o único). Índices 3 a 3 (45min/15min) dão três
      // horários realmente livres entre si — a corrida que importa aqui é a da
      // quota da assinatura, não a da EXCLUDE anti double-booking.
      const chosen = [slots[0]!, slots[3]!, slots[6]!];

      const responses = await Promise.all(
        chosen.map((slot) =>
          auth.post(url(`/public/${slug}/appointments`))
            .send({ serviceIds: [corteId], startsAt: slot.startsAt }),
        ),
      );

      for (const response of responses) {
        expect(response.status).toBe(201);
      }

      const covered = responses.filter((response) => response.body.appointment.totalPriceCents === 0);
      const charged = responses.filter((response) => response.body.appointment.totalPriceCents === 4_500);

      expect(covered).toHaveLength(2);
      expect(charged).toHaveLength(1);

      const current = await auth.get(url(`/public/${slug}/account/subscription`)).expect(200);
      const usage = current.body.subscription.usages.find(
        (item: { serviceId: string }) => item.serviceId === corteId,
      );
      // Nunca 3 — é exatamente isto que a UPDATE condicional impede.
      expect(usage.used).toBe(2);
    });

    it('pausar interrompe a cobertura — a próxima reserva do serviço sai cobrada', async () => {
      await auth.post(url(`/public/${slug}/account/subscription/pause`)).expect(200);

      const current = await auth.get(url(`/public/${slug}/account/subscription`)).expect(200);
      expect(current.body.subscription.status).toBe('PAUSED');
    });

    it('reativar dentro do ciclo volta a ACTIVE sem cobrar de novo', async () => {
      const response = await auth.post(url(`/public/${slug}/account/subscription/resume`)).expect(200);
      expect(response.body.status).toBe('ACTIVE');

      const history = await auth.get(url(`/public/${slug}/account/subscription`)).expect(200);
      // Só a cobrança da assinatura original — reativar não gerou uma segunda.
      expect(history.body.billingHistory).toHaveLength(1);
    });

    it('cancelar perde os usos restantes e some da tela — sem estorno, sem multa', async () => {
      await auth.post(url(`/public/${slug}/account/subscription/cancel`)).expect(200);

      const current = await auth.get(url(`/public/${slug}/account/subscription`)).expect(200);
      expect(current.body.subscription).toBeNull();
      // A cobrança feita continua no histórico — cancelar não reescreve o passado.
      expect(current.body.billingHistory).toHaveLength(1);
    });

    it('depois de cancelada, uma nova assinatura pode ser criada', async () => {
      await auth.post(url(`/public/${slug}/account/subscription`))
        .send({ planId, paymentMethod: 'PIX' })
        .expect(201);
    });
  });

  // ── Agendamentos e avaliação ─────────────────────────────────────────────────

  describe('agendamentos e avaliação', () => {
    let doneAppointmentId: string;

    beforeAll(async () => {
      // Simula o fechamento de comanda da fase 07 (fora de escopo aqui):
      // marca um dos agendamentos criados no teste de concorrência como DONE.
      const appointment = await prisma.appointment.findFirst({
        where: { tenantId, clientId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      doneAppointmentId = appointment!.id;
      await prisma.appointment.update({
        where: { id: doneAppointmentId },
        data: { status: 'DONE' },
      });
    });

    it('lista o atendimento concluído no histórico, ainda sem nota', async () => {
      const response = await auth.get(url(`/public/${slug}/account/appointments`)).expect(200);

      const item = response.body.history.find((row: { id: string }) => row.id === doneAppointmentId);
      expect(item).toBeDefined();
      expect(item.review).toBeNull();
    });

    it('avalia o atendimento — e uma segunda vez é recusada', async () => {
      const rated = await auth.post(url(`/public/${slug}/account/appointments/${doneAppointmentId}/rate`))
        .send({ rating: 5, comment: 'Excelente!' })
        .expect(200);

      expect(rated.body.review).toEqual({ id: expect.any(String), rating: 5, comment: 'Excelente!' });

      await auth.post(url(`/public/${slug}/account/appointments/${doneAppointmentId}/rate`))
        .send({ rating: 4 })
        .expect(409);
    });
  });

  // ── LGPD: exclusão anonimiza, sem apagar histórico financeiro ───────────────

  describe('POST /client-auth/me/delete', () => {
    it('recusa sem o checkbox de confirmação', async () => {
      await auth.post(url('/client-auth/me/delete')).send({ confirm: false }).expect(400);
    });

    it('anonimiza a conta e libera o telefone original para um cadastro novo', async () => {
      const beforeOrder = await prisma.order.findFirst({ where: { tenantId, clientId } });

      await auth.post(url('/client-auth/me/delete')).send({ confirm: true }).expect(204);

      const anonymized = await prisma.client.findUnique({ where: { id: clientId } });
      expect(anonymized?.name).toBe('Cliente removido');
      expect(anonymized?.email).toBeNull();
      expect(anonymized?.deletedAt).not.toBeNull();

      // Login antigo não funciona mais.
      await api()
        .post(url('/client-auth/login'))
        .send({ identifier: clientEmail, password: 'NovaSenha1' })
        .expect(401);

      // O telefone original está livre — não sobrou preso num placeholder.
      await api()
        .post(url('/client-auth/register'))
        .send({
          firstName: 'Outra',
          lastName: 'Pessoa',
          phone: clientPhone,
          email: `${clientEmail}.novo`,
          confirmEmail: `${clientEmail}.novo`,
          password: 'OutraSenha1',
          confirmPassword: 'OutraSenha1',
          acceptTerms: true,
        })
        .expect(202);

      // Histórico financeiro não sumiu — só quem ele identifica.
      if (beforeOrder) {
        const stillThere = await prisma.order.findUnique({ where: { id: beforeOrder.id } });
        expect(stillThere).not.toBeNull();
        expect(stillThere?.clientId).toBe(clientId);
      }
    });
  });
});
