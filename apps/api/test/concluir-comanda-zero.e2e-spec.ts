import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import {
  AppointmentStatus,
  CashRegisterStatus,
  MembershipRole,
  OrderStatus,
  PaymentMethod,
  PrismaClient,
} from '@prisma/client';
import { ErrorCode, PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Agente 31 — concluir sem comanda, comanda cheia ao nascer, R$ 0 que fecha.
 *
 * A regra de produto que estes casos guardam: **concluir um atendimento e
 * cobrar por ele são ações independentes.** Até aqui o único caminho para
 * `DONE` era fechar a comanda vinculada, e uma comanda de R$ 0 não fechava nem
 * cancelava — o balcão ficava sem saída em três situações reais (o corte
 * refeito de graça, o serviço já pago pela assinatura, a comanda aberta por
 * engano).
 */
describe('concluir e comanda de R$ 0 (agente 31, e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-ag31-${run}`;
  const password = 'ConcluirSenhaForte1!';

  let tenantId: string;
  let ownerToken: string;
  let barberToken: string;
  let barberId: string;
  let otherBarberId: string;
  /** R$ 45,00 */
  let corteId: string;
  /** R$ 35,00 */
  let barbaId: string;
  let productId: string;
  let clientId: string;
  /** Assinante do plano que cobre o corte E a barba. */
  let subscriberId: string;

  const CORTE_CENTS = 4_500;
  const BARBA_CENTS = 3_500;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${token}`),
  });
  const asOwner = () => as(ownerToken);
  const asBarber = () => as(barberToken);

  /**
   * Um agendamento gravado direto no banco.
   *
   * Não passa por `POST /staff-agenda` de propósito: aqui o que importa é o
   * estado do agendamento (serviços, preço fotografado, cobertura), não a
   * validação de grade — que `agenda.e2e-spec.ts` já cobre. Assim cada caso
   * monta exatamente a situação que quer testar, sem depender do relógio.
   */
  let sequence = 0;
  /**
   * Cada agendamento cai numa hora só dele: a EXCLUDE `no_double_booking`
   * (fase 01) recusa dois intervalos sobrepostos do MESMO barbeiro, e a
   * fixture cria vários seguidos.
   *
   * A base fica um dia à frente de propósito — assim estes agendamentos NUNCA
   * caem na janela "hoje" do relatório, e o caso que mede "Atendimentos" pode
   * comparar um delta limpo com o agendamento que ele próprio cria agora.
   */
  const slotBase = new Date(Date.now() + 26 * 60 * 60_000);
  const makeAppointment = async (options: {
    barberId?: string;
    clientId?: string | null;
    services: Array<{ serviceId: string; priceCents: number; usageId?: string | null }>;
    status?: AppointmentStatus;
    startsAt?: Date;
  }) => {
    sequence += 1;
    const startsAt =
      options.startsAt ?? new Date(slotBase.getTime() + sequence * 35 * 60_000);
    const lines = options.services;
    const appointment = await prisma.appointment.create({
      data: {
        tenantId,
        bookingCode: `AG31-${run}-${sequence}`,
        barberId: options.barberId ?? barberId,
        serviceId: lines[0]!.serviceId,
        clientId: options.clientId === undefined ? clientId : options.clientId,
        guestName: options.clientId === null ? 'Avulso AG31' : null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: options.status ?? AppointmentStatus.CONFIRMED,
        priceCents: lines.reduce((total, line) => total + line.priceCents, 0),
        subscriptionUsageId: lines.find((line) => line.usageId)?.usageId ?? null,
        services: {
          create: lines.map((line, index) => ({
            tenantId,
            serviceId: line.serviceId,
            sortOrder: index,
            priceCents: line.priceCents,
            durationMin: 30,
            subscriptionUsageId: line.usageId ?? null,
          })),
        },
      },
      select: { id: true },
    });
    return appointment.id;
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
        code: `e2e-ag31-${run}`,
        name: 'Avançado (e2e ag31)',
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
        name: 'Barbearia AG31 (e2e)',
        timezone: 'America/Sao_Paulo',
        planId: saasPlan.id,
        settings: { create: { allowOnlineBooking: true } },
        loyaltyProgram: {
          create: { active: true, gastoPorPonto: 100, pontosParaDesconto: 100, valorDesconto: 1_000 },
        },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-ag31-owner-${run}@barbervp.test`;
    const barberEmail = `e2e-ag31-barber-${run}@barbervp.test`;

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dono AG31',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });
    const barberUser = await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro AG31',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
      select: { id: true },
    });

    // Regra de comissão de verdade: é ela que faz o fechamento normal lançar
    // `CommissionEntry` — e o contraste com a cortesia, que não lança nada.
    const commissionRule = await prisma.commissionRule.create({
      data: {
        tenantId,
        name: `Padrão AG31 ${run}`,
        type: 'FIXED',
        percentBps: 4_000,
        percentProdutosBps: 1_000,
      },
      select: { id: true },
    });

    barberId = (
      await prisma.barber.create({
        data: {
          tenantId,
          userId: barberUser.id,
          name: 'Barbeiro AG31',
          commissionRuleId: commissionRule.id,
        },
        select: { id: true },
      })
    ).id;
    otherBarberId = (
      await prisma.barber.create({
        data: { tenantId, name: 'Outro AG31' },
        select: { id: true },
      })
    ).id;

    corteId = (
      await prisma.service.create({
        data: { tenantId, name: 'Corte degradê AG31', durationMin: 30, priceCents: CORTE_CENTS },
        select: { id: true },
      })
    ).id;
    barbaId = (
      await prisma.service.create({
        data: { tenantId, name: 'Barba AG31', durationMin: 30, priceCents: BARBA_CENTS },
        select: { id: true },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: { tenantId, name: 'Pomada AG31', priceCents: 3_000, stock: 20, estoqueMin: 2 },
        select: { id: true },
      })
    ).id;

    clientId = (
      await prisma.client.create({
        data: {
          phone: `9931${run}`,
          name: 'Cliente AG31',
          profiles: { create: { tenantId, phone: `9931${run}` } },
        },
        select: { id: true },
      })
    ).id;
    subscriberId = (
      await prisma.client.create({
        data: {
          phone: `9932${run}`,
          name: 'Assinante AG31',
          profiles: { create: { tenantId, phone: `9932${run}` } },
        },
        select: { id: true },
      })
    ).id;

    const plan = await prisma.clientPlan.create({
      data: {
        tenantId,
        name: 'Clube AG31',
        priceCents: 9_900,
        items: {
          create: [
            { tenantId, serviceId: corteId, quota: 4 },
            { tenantId, serviceId: barbaId, quota: 4 },
          ],
        },
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
        usages: {
          create: [
            { tenantId, serviceId: corteId, periodStart, periodEnd, quota: 4, used: 0 },
            { tenantId, serviceId: barbaId, periodStart, periodEnd, quota: 4, used: 0 },
          ],
        },
      },
    });

    ownerToken = (await api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200))
      .body.accessToken;
    barberToken = (await api().post(url('/auth/login')).send({ email: barberEmail, password }).expect(200))
      .body.accessToken;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.client.deleteMany({ where: { id: { in: [clientId, subscriberId] } } });
    await prisma.saasPlan.deleteMany({ where: { code: `e2e-ag31-${run}` } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Bloco A — "Concluir" sem comanda ─────────────────────────────────────

  describe('PATCH /staff-agenda/:id/done', () => {
    it('conclui o atendimento SEM comanda, sem lançamento financeiro nenhum', async () => {
      const appointmentId = await makeAppointment({
        services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
      });

      const done = await asOwner().patch(`/staff-agenda/${appointmentId}/done`).send({}).expect(200);
      expect(done.body.status).toBe(AppointmentStatus.DONE);

      // Nada de comanda, pagamento, comissão ou ponto: concluir não cobra.
      expect(await prisma.order.count({ where: { tenantId, appointmentId } })).toBe(0);
      expect(await prisma.payment.count({ where: { tenantId } })).toBe(0);
      expect(await prisma.commissionEntry.count({ where: { tenantId } })).toBe(0);

      const log = await prisma.auditLog.findFirst({
        where: { tenantId, entityId: appointmentId, action: 'staff_agenda.appointment_done' },
        select: { metadata: true },
      });
      expect(log).not.toBeNull();
      expect(log?.metadata).toMatchObject({ withOrder: false });
    });

    it('é idempotente sobre DONE e recusa o que já foi cancelado', async () => {
      const appointmentId = await makeAppointment({
        services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
      });
      await asOwner().patch(`/staff-agenda/${appointmentId}/done`).send({}).expect(200);
      // Segundo clique do balcão: 200, não 409.
      await asOwner().patch(`/staff-agenda/${appointmentId}/done`).send({}).expect(200);

      const canceladoId = await makeAppointment({
        services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
        status: AppointmentStatus.CANCELED,
      });
      const recusa = await asOwner().patch(`/staff-agenda/${canceladoId}/done`).send({}).expect(409);
      expect(recusa.body.code).toBe(ErrorCode.APPOINTMENT_NOT_CONCLUDABLE);
    });

    it('BARBER não conclui o atendimento de outro barbeiro', async () => {
      const alheio = await makeAppointment({
        barberId: otherBarberId,
        services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
      });
      const proprio = await makeAppointment({
        services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
      });

      await asBarber().patch(`/staff-agenda/${alheio}/done`).send({}).expect(403);
      await asBarber().patch(`/staff-agenda/${proprio}/done`).send({}).expect(200);
    });
  });

  // ── Bloco B — a comanda nasce preenchida ─────────────────────────────────

  describe('POST /orders com appointmentId', () => {
    it('traz os serviços do agendamento como itens, ao preço fotografado', async () => {
      const appointmentId = await makeAppointment({
        services: [
          { serviceId: barbaId, priceCents: BARBA_CENTS },
          { serviceId: corteId, priceCents: CORTE_CENTS },
        ],
      });

      const order = await asOwner().post('/orders').send({ appointmentId }).expect(201);

      expect(order.body.items).toHaveLength(2);
      expect(order.body.items.map((item: { description: string }) => item.description)).toEqual([
        'Barba AG31',
        'Corte degradê AG31',
      ]);
      // O subtotal da comanda bate com o total do agendamento.
      expect(order.body.subtotalCents).toBe(BARBA_CENTS + CORTE_CENTS);
      expect(order.body.totalCents).toBe(BARBA_CENTS + CORTE_CENTS);
      expect(order.body.barberId).toBe(barberId);
      expect(order.body.clientId).toBe(clientId);
    });

    it('serviço coberto pela assinatura entra a R$ 0 SEM debitar a quota de novo', async () => {
      const usage = await prisma.subscriptionUsage.findFirstOrThrow({
        where: { tenantId, serviceId: corteId, subscription: { clientId: subscriberId } },
        select: { id: true },
      });
      // A reserva já consumiu 1 dos 4 — é o que o booking faz ao gravar.
      await prisma.subscriptionUsage.update({ where: { id: usage.id }, data: { used: 1 } });

      const appointmentId = await makeAppointment({
        clientId: subscriberId,
        services: [{ serviceId: corteId, priceCents: 0, usageId: usage.id }],
      });

      const order = await asOwner().post('/orders').send({ appointmentId }).expect(201);
      expect(order.body.items[0].coveredBySubscription).toBe(true);
      expect(order.body.items[0].unitPriceCents).toBe(0);
      expect(order.body.totalCents).toBe(0);

      // Fechar a comanda NÃO pode consumir uma segunda quota: quem segura a
      // reserva é o agendamento.
      await asOwner()
        .post(`/orders/${order.body.id}/close`)
        .send({
          payments: [{ method: PaymentMethod.COURTESY, amountCents: 0 }],
          courtesyReason: 'Corte incluído no plano do assinante',
        })
        .expect(201);

      const after = await prisma.subscriptionUsage.findUniqueOrThrow({
        where: { id: usage.id },
        select: { used: true },
      });
      expect(after.used).toBe(1);
    });

    it('BARBER não abre comanda do atendimento de outro barbeiro', async () => {
      const alheio = await makeAppointment({
        barberId: otherBarberId,
        services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
      });
      await asBarber().post('/orders').send({ appointmentId: alheio }).expect(403);
    });

    it('abrir comanda continua permitido depois de "Concluir"', async () => {
      const appointmentId = await makeAppointment({
        services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
      });
      await asOwner().patch(`/staff-agenda/${appointmentId}/done`).send({}).expect(200);

      const order = await asOwner().post('/orders').send({ appointmentId }).expect(201);
      expect(order.body.items).toHaveLength(1);

      // E o drawer passa a oferecer "Ver comanda".
      const detail = await asOwner().get(`/staff-agenda/${appointmentId}`).expect(200);
      expect(detail.body.order).toMatchObject({ id: order.body.id, status: OrderStatus.OPEN });
    });
  });

  // ── Bloco C — o "Total R$ 0,00" do drawer ────────────────────────────────

  it('o drawer diz que o combo de R$ 0 está coberto pela assinatura', async () => {
    const usages = await prisma.subscriptionUsage.findMany({
      where: { tenantId, subscription: { clientId: subscriberId } },
      select: { id: true, serviceId: true },
    });
    const usageOf = (serviceId: string) => usages.find((row) => row.serviceId === serviceId)!.id;

    const cobertoId = await makeAppointment({
      clientId: subscriberId,
      services: [
        { serviceId: barbaId, priceCents: 0, usageId: usageOf(barbaId) },
        { serviceId: corteId, priceCents: 0, usageId: usageOf(corteId) },
      ],
    });

    const coberto = await asOwner().get(`/staff-agenda/${cobertoId}`).expect(200);
    expect(coberto.body.appointment.totalPriceCents).toBe(0);
    expect(coberto.body.appointment.coveredBySubscription).toBe(true);
    // O preço de TABELA continua acessível — o zero é cobertura, não catálogo
    // sem preço.
    expect(coberto.body.appointment.services[1].listPriceCents).toBe(CORTE_CENTS);

    // E um agendamento comum não ganha o rótulo por engano.
    const comumId = await makeAppointment({
      services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
    });
    const comum = await asOwner().get(`/staff-agenda/${comumId}`).expect(200);
    expect(comum.body.appointment.coveredBySubscription).toBe(false);
    expect(comum.body.appointment.totalPriceCents).toBe(CORTE_CENTS);
  });

  // ── Bloco D — cancelar comanda ───────────────────────────────────────────

  describe('POST /orders/:id/cancel', () => {
    it('some de "Abertas", aparece em CANCELED e deixa o agendamento como estava', async () => {
      const appointmentId = await makeAppointment({
        services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
      });
      const order = await asOwner().post('/orders').send({ appointmentId }).expect(201);

      const canceled = await asOwner().post(`/orders/${order.body.id}/cancel`).send({}).expect(201);
      expect(canceled.body.status).toBe(OrderStatus.CANCELED);
      expect(canceled.body.canceledAt).not.toBeNull();

      const abertas = await asOwner().get('/orders?status=OPEN').expect(200);
      expect(abertas.body.data.map((row: { id: string }) => row.id)).not.toContain(order.body.id);

      const canceladas = await asOwner().get('/orders?status=CANCELED').expect(200);
      expect(canceladas.body.data.map((row: { id: string }) => row.id)).toContain(order.body.id);

      // O agendamento não foi tocado: abrir comanda nunca mexeu no status
      // dele, então cancelá-la não tem o que devolver.
      const appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { status: true },
      });
      expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);

      // Nenhum lançamento financeiro nasceu nem morreu no caminho.
      expect(await prisma.payment.count({ where: { tenantId, orderId: order.body.id } })).toBe(0);
      expect(await prisma.commissionEntry.count({ where: { tenantId, orderId: order.body.id } })).toBe(0);
    });

    it('não toca num agendamento já concluído, e recusa comanda fechada', async () => {
      const appointmentId = await makeAppointment({
        services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
      });
      await asOwner().patch(`/staff-agenda/${appointmentId}/done`).send({}).expect(200);
      const order = await asOwner().post('/orders').send({ appointmentId }).expect(201);
      await asOwner().post(`/orders/${order.body.id}/cancel`).send({}).expect(201);

      const appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { status: true },
      });
      expect(appointment.status).toBe(AppointmentStatus.DONE);

      // Cancelar de novo (já cancelada) e cancelar uma fechada: 409.
      await asOwner().post(`/orders/${order.body.id}/cancel`).send({}).expect(409);
    });

    it('BARBER cancela a própria comanda, nunca a de outro', async () => {
      const propria = await asOwner().post('/orders').send({ clientId, barberId }).expect(201);
      const alheia = await asOwner().post('/orders').send({ clientId, barberId: otherBarberId }).expect(201);

      await asBarber().post(`/orders/${alheia.body.id}/cancel`).send({}).expect(403);
      await asBarber().post(`/orders/${propria.body.id}/cancel`).send({}).expect(201);
    });
  });

  // ── Bloco E — fechar com R$ 0, com motivo ────────────────────────────────

  describe('POST /orders/:id/close — cortesia', () => {
    /** Uma comanda aberta com um corte lançado, pronta para fechar. */
    const orderWithCorte = async () => {
      const order = await asOwner().post('/orders').send({ clientId, barberId }).expect(201);
      await asOwner()
        .post(`/orders/${order.body.id}/items`)
        .send({ kind: 'SERVICE', serviceId: corteId })
        .expect(201);
      return order.body.id as string;
    };

    it('comanda vazia recusa o fechamento com código próprio', async () => {
      const order = await asOwner().post('/orders').send({ clientId, barberId }).expect(201);
      const recusa = await asOwner()
        .post(`/orders/${order.body.id}/close`)
        .send({ payments: [{ method: PaymentMethod.COURTESY, amountCents: 0 }], courtesyReason: 'nada aqui' })
        .expect(400);
      expect(recusa.body.code).toBe(ErrorCode.ORDER_EMPTY);
    });

    it('total zero sem motivo é recusado; com motivo, fecha', async () => {
      const orderId = await orderWithCorte();
      // 100% de desconto: a comanda passa a não ter valor a cobrar.
      await asOwner()
        .patch(`/orders/${orderId}/discount`)
        .send({ discountType: 'PERCENT', discountValue: 10_000 })
        .expect(200);

      const semMotivo = await asOwner()
        .post(`/orders/${orderId}/close`)
        .send({ payments: [{ method: PaymentMethod.COURTESY, amountCents: 0 }] })
        .expect(400);
      expect(semMotivo.body.code).toBe(ErrorCode.COURTESY_REASON_REQUIRED);

      // E fechar com um método real também não passa: não há o que cobrar.
      const comPix = await asOwner()
        .post(`/orders/${orderId}/close`)
        .send({ payments: [{ method: PaymentMethod.PIX, amountCents: 0 }] })
        .expect(400);
      expect(comPix.body.code).toBe(ErrorCode.BAD_REQUEST);

      const fechada = await asOwner()
        .post(`/orders/${orderId}/close`)
        .send({
          payments: [{ method: PaymentMethod.COURTESY, amountCents: 0 }],
          courtesyReason: 'Refazendo o corte da semana passada',
        })
        .expect(201);

      expect(fechada.body.status).toBe(OrderStatus.CLOSED);
      expect(fechada.body.totalCents).toBe(0);
      expect(fechada.body.courtesyReason).toBe('Refazendo o corte da semana passada');
    });

    it('cortesia com valor perdoa o total, não gera caixa nem comissão, e grava o motivo', async () => {
      await prisma.cashRegister.create({
        data: { tenantId, status: CashRegisterStatus.OPEN, openingCents: 10_000 },
      });

      const orderId = await orderWithCorte();
      await asOwner()
        .post(`/orders/${orderId}/items`)
        .send({ kind: 'PRODUCT', productId })
        .expect(201);

      const fechada = await asOwner()
        .post(`/orders/${orderId}/close`)
        .send({
          payments: [{ method: PaymentMethod.COURTESY, amountCents: 0 }],
          courtesyReason: 'Brinde de inauguração',
        })
        .expect(201);

      // O total cobrado é zero; o que seria cobrado fica registrado.
      expect(fechada.body.totalCents).toBe(0);
      expect(fechada.body.courtesyCents).toBe(CORTE_CENTS + 3_000);
      expect(fechada.body.subtotalCents).toBe(CORTE_CENTS + 3_000);

      expect(await prisma.cashMovement.count({ where: { tenantId, orderId } })).toBe(0);
      expect(await prisma.commissionEntry.count({ where: { tenantId, orderId } })).toBe(0);
      expect(await prisma.loyaltyPoints.count({ where: { tenantId, orderId } })).toBe(0);

      // O pagamento existe, e vale R$ 0 — é ele que o relatório conta.
      const payments = await prisma.payment.findMany({ where: { tenantId, orderId } });
      expect(payments).toHaveLength(1);
      expect(payments[0]!.method).toBe(PaymentMethod.COURTESY);
      expect(payments[0]!.amountCents).toBe(0);

      // O produto SAIU da prateleira, mesmo de graça.
      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { stock: true },
      });
      expect(product.stock).toBe(19);

      const log = await prisma.auditLog.findFirst({
        where: { tenantId, entityId: orderId, action: 'pos.order_closed' },
        select: { metadata: true },
      });
      expect(log?.metadata).toMatchObject({
        courtesy: true,
        courtesyReason: 'Brinde de inauguração',
      });

      await prisma.cashRegister.deleteMany({ where: { tenantId } });
    });

    it('cortesia não se divide com outro método', async () => {
      const orderId = await orderWithCorte();
      const recusa = await asOwner()
        .post(`/orders/${orderId}/close`)
        .send({
          payments: [
            { method: PaymentMethod.PIX, amountCents: 2_000 },
            { method: PaymentMethod.COURTESY, amountCents: 2_500 },
          ],
          courtesyReason: 'metade de graça',
        })
        .expect(400);
      expect(recusa.body.code).toBe(ErrorCode.COURTESY_CANNOT_SPLIT);
    });

    it('reabrir uma cortesia devolve o total e apaga o motivo', async () => {
      const orderId = await orderWithCorte();
      await asOwner()
        .post(`/orders/${orderId}/close`)
        .send({
          payments: [{ method: PaymentMethod.COURTESY, amountCents: 0 }],
          courtesyReason: 'Cliente reclamou do acabamento',
        })
        .expect(201);

      const reaberta = await asOwner()
        .post(`/orders/${orderId}/reopen`)
        .send({ reason: 'cortesia lançada por engano' })
        .expect(201);

      expect(reaberta.body.status).toBe(OrderStatus.OPEN);
      expect(reaberta.body.courtesyReason).toBeNull();
      expect(reaberta.body.courtesyCents).toBe(0);
      // O total volta a ser cobrável — sem isto, fechar de novo por Pix
      // registraria uma venda de R$ 0,00.
      expect(reaberta.body.totalCents).toBe(CORTE_CENTS);
    });

    it('o fechamento normal continua igual', async () => {
      const orderId = await orderWithCorte();
      const fechada = await asOwner()
        .post(`/orders/${orderId}/close`)
        .send({ payments: [{ method: PaymentMethod.PIX, amountCents: CORTE_CENTS }] })
        .expect(201);

      expect(fechada.body.totalCents).toBe(CORTE_CENTS);
      expect(fechada.body.courtesyReason).toBeNull();
      expect(fechada.body.courtesyCents).toBe(0);
      expect(await prisma.commissionEntry.count({ where: { tenantId, orderId } })).toBeGreaterThan(0);
    });
  });

  // ── Relatórios — o atendimento sem comanda não some ──────────────────────

  it('"Atendimentos" conta o concluído SEM comanda, e as cortesias têm recorte próprio', async () => {
    // Janela limpa: tudo que os casos acima criaram fica fora de "hoje" só se
    // o relógio ajudar, então o número é medido como DELTA.
    const antes = await asOwner().get('/reports/summary?period=hoje').expect(200);

    // AGORA, e num barbeiro sem nada marcado: o atendimento tem de cair
    // dentro de "hoje" no fuso da barbearia para o delta valer.
    const appointmentId = await makeAppointment({
      barberId: otherBarberId,
      startsAt: new Date(),
      services: [{ serviceId: corteId, priceCents: CORTE_CENTS }],
    });
    await asOwner().patch(`/staff-agenda/${appointmentId}/done`).send({}).expect(200);

    const depois = await asOwner().get('/reports/summary?period=hoje').expect(200);

    // Um atendimento a mais, faturamento igual: ele aconteceu e não cobrou.
    expect(depois.body.orders).toBe(antes.body.orders + 1);
    expect(depois.body.revenueCents).toBe(antes.body.revenueCents);

    // As cortesias fechadas nos casos acima aparecem no recorte, a preço de
    // tabela — e não como uma fatia de R$ 0 na rosca de faturamento.
    expect(depois.body.courtesies.count).toBeGreaterThan(0);
    expect(depois.body.courtesies.listPriceCents).toBeGreaterThan(0);
    expect(
      depois.body.paymentDistribution.some(
        (entry: { method: string }) => entry.method === PaymentMethod.COURTESY,
      ),
    ).toBe(false);
  });
});
