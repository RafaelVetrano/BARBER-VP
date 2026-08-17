import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Booking público de ponta a ponta, contra o banco real.
 *
 * A suíte monta a própria barbearia (e uma vizinha, para o caso de isolamento)
 * em vez de reaproveitar o seed: assim os horários livres são conhecidos e o
 * teste não passa a depender de quantos agendamentos o `seed` plantou hoje.
 *
 * O caso que dá nome à fase é `corrida de slot`: dois POSTs disparados juntos
 * para o MESMO barbeiro e horário. Um vence, o outro toma 409 — e quem garante
 * isso é a EXCLUDE `no_double_booking`, não a validação de grade, que ambos
 * atravessam por verem o horário livre no momento em que consultaram.
 */
describe('booking público (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slugA = `e2e-book-a-${run}`;
  const slugB = `e2e-book-b-${run}`;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  /** Ids do tenant A, preenchidos no `beforeAll`. */
  let tenantAId: string;
  let corteId: string;
  let barbaId: string;
  let comboId: string;
  let pigmentacaoId: string;
  let carlosId: string;
  let brunoId: string;
  /** Serviço do tenant B — nenhuma rota de A pode aceitá-lo. */
  let foreignServiceId: string;

  /** Dia de trabalho (seg–sáb) suficientemente à frente para caber na grade. */
  const targetDate = (() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 3);
    // Domingo é fechado nesta barbearia; empurra para segunda.
    if (date.getUTCDay() === 0) {
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return date.toISOString().slice(0, 10);
  })();

  const guestPhone = (suffix: string) => `(16) 9 ${run.slice(0, 4)}-${suffix}`;

  async function createTenant(slug: string, name: string) {
    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name,
        timezone: 'America/Sao_Paulo',
        settings: {
          create: {
            allowOnlineBooking: true,
            // Antecedência mínima curta: a suíte agenda para daqui a 3 dias, mas
            // um valor alto esconderia o dia inteiro em execuções perto da meia-noite.
            antecedenciaMinima: 30,
            cancelamentoHoras: 2,
            slotIntervalMin: 15,
            sobre: `Sobre a ${name}`,
            address: 'Rua de Teste, 100',
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

  async function createService(
    tenantId: string,
    name: string,
    durationMin: number,
    priceCents: number,
    isCombo = false,
  ) {
    const service = await prisma.service.create({
      data: { tenantId, name, durationMin, priceCents, isCombo },
      select: { id: true },
    });
    return service.id;
  }

  async function createBarber(tenantId: string, name: string, serviceIds: string[]) {
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
              lunchStart: 12 * 60,
              lunchEnd: 13 * 60,
              isDayOff: false,
            })),
          ],
        },
      },
      select: { id: true },
    });
    return barber.id;
  }

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

    tenantAId = await createTenant(slugA, 'Barbearia A (e2e)');
    corteId = await createService(tenantAId, 'Corte Masculino', 45, 4_500);
    barbaId = await createService(tenantAId, 'Barba', 30, 3_500);
    comboId = await createService(tenantAId, 'Corte + Barba', 70, 7_000, true);
    pigmentacaoId = await createService(tenantAId, 'Pigmentação', 40, 6_000);

    await prisma.serviceComboPart.createMany({
      data: [corteId, barbaId].map((partServiceId) => ({
        tenantId: tenantAId,
        comboServiceId: comboId,
        partServiceId,
      })),
    });

    // Carlos faz tudo menos Pigmentação; Bruno é o único que pigmenta — a mesma
    // exclusividade do seed (lá é o Diego), que é o que o wizard tem de refletir.
    carlosId = await createBarber(tenantAId, 'Carlos e2e', [corteId, barbaId, comboId]);
    brunoId = await createBarber(tenantAId, 'Bruno e2e', [
      corteId,
      barbaId,
      comboId,
      pigmentacaoId,
    ]);

    const tenantBId = await createTenant(slugB, 'Barbearia B (e2e)');
    foreignServiceId = await createService(tenantBId, 'Serviço do vizinho', 30, 3_000);
    await createBarber(tenantBId, 'Barbeiro do vizinho', [foreignServiceId]);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
    await app.close();
    await prisma.$disconnect();
  });

  /** Primeiro horário livre do dia-alvo para a seleção informada. */
  async function firstSlot(serviceIds: string[], barberId?: string) {
    const response = await api()
      .get(url(`/public/${slugA}/availability`))
      .query({ serviceIds: serviceIds.join(','), date: targetDate, ...(barberId ? { barberId } : {}) })
      .expect(200);

    const slot = response.body.slots[0];
    expect(slot).toBeDefined();
    return slot as { time: string; startsAt: string; barberIds: string[] };
  }

  // ── Página pública ────────────────────────────────────────────────────────

  describe('GET /public/:slug', () => {
    it('devolve a barbearia inteira numa resposta', async () => {
      const response = await api().get(url(`/public/${slugA}`)).expect(200);

      expect(response.body.slug).toBe(slugA);
      expect(response.body.timezone).toBe('America/Sao_Paulo');
      expect(response.body.services).toHaveLength(4);
      expect(response.body.barbers).toHaveLength(2);
      expect(response.body.businessHours).toHaveLength(7);
      expect(response.body.policy.cancelWindowHours).toBe(2);
      // Sem sessão de cliente não há assinatura para mostrar.
      expect(response.body.subscription).toBeNull();
    });

    it('traz a composição do combo, para o wizard saber o que ele substitui', async () => {
      const response = await api().get(url(`/public/${slugA}`)).expect(200);
      const combo = response.body.services.find(
        (service: { id: string }) => service.id === comboId,
      );
      expect(combo.isCombo).toBe(true);
      expect(combo.comboPartIds.sort()).toEqual([corteId, barbaId].sort());
    });

    it('responde 404 para slug inexistente, sem revelar nada', async () => {
      await api().get(url('/public/nao-existe-mesmo')).expect(404);
    });

    /** Regra inviolável 3. */
    it('não vaza serviço nem barbeiro da barbearia vizinha', async () => {
      const response = await api().get(url(`/public/${slugB}`)).expect(200);

      const ids = response.body.services.map((service: { id: string }) => service.id);
      expect(ids).toContain(foreignServiceId);
      expect(ids).not.toContain(corteId);
      expect(response.body.barbers.map((barber: { id: string }) => barber.id)).not.toContain(
        carlosId,
      );
    });
  });

  // ── Cotação: combo e compatibilidade ──────────────────────────────────────

  describe('GET /public/:slug/quote', () => {
    it('aplica o combo quando as duas peças vêm juntas', async () => {
      const response = await api()
        .get(url(`/public/${slugA}/quote`))
        .query({ serviceIds: `${corteId},${barbaId}` })
        .expect(200);

      expect(response.body.comboApplied).toBe(true);
      expect(response.body.resolvedServiceIds).toEqual([comboId]);
      expect(response.body.totalDurationMin).toBe(70);
      // R$ 70 do combo, e não os R$ 80 das peças avulsas.
      expect(response.body.totalPriceCents).toBe(7_000);
    });

    it('não inventa combo quando falta uma peça', async () => {
      const response = await api()
        .get(url(`/public/${slugA}/quote`))
        .query({ serviceIds: corteId })
        .expect(200);

      expect(response.body.comboApplied).toBe(false);
      expect(response.body.totalPriceCents).toBe(4_500);
    });

    it('desabilita quem não faz o serviço, com o motivo visível', async () => {
      const response = await api()
        .get(url(`/public/${slugA}/quote`))
        .query({ serviceIds: pigmentacaoId })
        .expect(200);

      expect(response.body.eligibleBarberIds).toEqual([brunoId]);
      expect(response.body.ineligibleBarbers).toEqual([
        { barberId: carlosId, reason: 'não realiza Pigmentação' },
      ]);
    });

    /** Isolamento: id de serviço do vizinho não vira agendamento aqui. */
    it('recusa serviço de outra barbearia', async () => {
      await api()
        .get(url(`/public/${slugA}/quote`))
        .query({ serviceIds: foreignServiceId })
        .expect(400);
    });
  });

  // ── Motor de disponibilidade ──────────────────────────────────────────────

  describe('GET /public/:slug/availability', () => {
    it('marca domingo como fechado e sábado com expediente menor', async () => {
      const response = await api()
        .get(url(`/public/${slugA}/availability`))
        .query({ serviceIds: corteId, days: 14 })
        .expect(200);

      const sunday = response.body.days.find((day: { weekday: number }) => day.weekday === 0);
      expect(sunday.closed).toBe(true);
      expect(sunday.availableCount).toBe(0);

      const saturday = response.body.days.find((day: { weekday: number }) => day.weekday === 6);
      const weekday = response.body.days.find((day: { weekday: number }) => day.weekday === 3);
      expect(saturday.availableCount).toBeLessThan(weekday.availableCount);
    });

    it('respeita o intervalo de almoço e o fim do expediente', async () => {
      const response = await api()
        .get(url(`/public/${slugA}/availability`))
        .query({ serviceIds: corteId, date: targetDate })
        .expect(200);

      const times: string[] = response.body.slots.map((slot: { time: string }) => slot.time);

      // Corte dura 45 min: 11:15+45 = 12:00 cabe; 11:30 invadiria o almoço.
      expect(times).toContain('11:15');
      expect(times).not.toContain('11:30');
      expect(times).not.toContain('12:00');
      expect(times).toContain('13:00');
      // Fecha às 20:00 — o último início possível é 19:15.
      expect(times).toContain('19:15');
      expect(times).not.toContain('19:30');
    });

    it('soma a duração dos serviços escolhidos', async () => {
      const single = await api()
        .get(url(`/public/${slugA}/availability`))
        .query({ serviceIds: corteId, date: targetDate })
        .expect(200);

      const combo = await api()
        .get(url(`/public/${slugA}/availability`))
        .query({ serviceIds: `${corteId},${barbaId}`, date: targetDate })
        .expect(200);

      expect(single.body.totalDurationMin).toBe(45);
      expect(combo.body.totalDurationMin).toBe(70);
      // Atendimento mais longo cabe em menos lugares.
      expect(combo.body.slots.length).toBeLessThan(single.body.slots.length);
    });

    it('nunca oferece horário no passado', async () => {
      const response = await api()
        .get(url(`/public/${slugA}/availability`))
        .query({ serviceIds: corteId, days: 14 })
        .expect(200);

      for (const slot of response.body.slots) {
        expect(new Date(slot.startsAt).getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('em "sem preferência" diz quem pode assumir cada horário', async () => {
      const slot = await firstSlot([corteId]);
      expect(slot.barberIds.sort()).toEqual([carlosId, brunoId].sort());
    });

    it('com barbeiro escolhido, restringe a ele', async () => {
      const slot = await firstSlot([corteId], carlosId);
      expect(slot.barberIds).toEqual([carlosId]);
    });

    it('aponta o próximo dia livre', async () => {
      const response = await api()
        .get(url(`/public/${slugA}/availability`))
        .query({ serviceIds: corteId, date: targetDate })
        .expect(200);

      expect(response.body.nextAvailableDate).not.toBeNull();
      expect(response.body.nextAvailableDate > targetDate).toBe(true);
      expect(response.body.nextAvailableTime).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  // ── Criação ───────────────────────────────────────────────────────────────

  describe('POST /public/:slug/appointments', () => {
    it('agenda como visitante e devolve código de reserva', async () => {
      const slot = await firstSlot([corteId], carlosId);

      const response = await api()
        .post(url(`/public/${slugA}/appointments`))
        .send({
          serviceIds: [corteId],
          barberId: carlosId,
          startsAt: slot.startsAt,
          guestName: 'Visitante e2e',
          guestPhone: guestPhone('1001'),
          notes: 'máquina 2 na lateral',
        })
        .expect(201);

      expect(response.body.kind).toBe('confirmed');
      expect(response.body.appointment.bookingCode).toMatch(/^AG-[A-Z0-9]{5}$/);
      expect(response.body.appointment.status).toBe('SCHEDULED');
      expect(response.body.appointment.services).toHaveLength(1);
      expect(response.body.appointment.totalPriceCents).toBe(4_500);
      // A política vem do tenant, nunca de texto fixo na tela.
      expect(response.body.appointment.cancelWindowHours).toBe(2);
    });

    it('grava o combo como UM atendimento de 70 minutos', async () => {
      const slot = await firstSlot([corteId, barbaId], brunoId);

      const response = await api()
        .post(url(`/public/${slugA}/appointments`))
        .send({
          serviceIds: [corteId, barbaId],
          barberId: brunoId,
          startsAt: slot.startsAt,
          guestName: 'Visitante Combo',
          guestPhone: guestPhone('1002'),
        })
        .expect(201);

      const appointment = response.body.appointment;
      expect(appointment.services).toHaveLength(1);
      expect(appointment.services[0].name).toBe('Corte + Barba');
      expect(appointment.totalPriceCents).toBe(7_000);
      expect(
        new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime(),
      ).toBe(70 * 60_000);
    });

    it('enfileira confirmação agora e os lembretes para o futuro', async () => {
      const slot = await firstSlot([corteId], carlosId);

      const response = await api()
        .post(url(`/public/${slugA}/appointments`))
        .send({
          serviceIds: [corteId],
          barberId: carlosId,
          startsAt: slot.startsAt,
          guestName: 'Visitante Aviso',
          guestPhone: guestPhone('1003'),
        })
        .expect(201);

      const appointmentId = response.body.appointment.id;
      const messages = await prisma.notificationOutbox.findMany({
        where: { tenantId: tenantAId, payload: { path: ['appointmentId'], equals: appointmentId } },
        select: { templateKey: true, status: true, scheduledFor: true },
      });

      const confirmation = messages.find((m) => m.templateKey === 'appointment.confirmation');
      const reminders = messages.filter((m) => m.templateKey === 'appointment.reminder');

      expect(confirmation?.status).toBe('SENT');
      expect(confirmation?.scheduledFor).toBeNull();
      // 24h e 2h antes, conforme `TenantSettings`.
      expect(reminders).toHaveLength(2);
      for (const reminder of reminders) {
        expect(reminder.status).toBe('PENDING');
        expect(reminder.scheduledFor!.getTime()).toBeGreaterThan(Date.now());
        expect(reminder.scheduledFor!.getTime()).toBeLessThan(
          new Date(response.body.appointment.startsAt).getTime(),
        );
      }
    });

    it('recusa barbeiro incompatível com o serviço', async () => {
      const slot = await firstSlot([pigmentacaoId], brunoId);

      await api()
        .post(url(`/public/${slugA}/appointments`))
        .send({
          serviceIds: [pigmentacaoId],
          barberId: carlosId,
          startsAt: slot.startsAt,
          guestName: 'Visitante Incompatível',
          guestPhone: guestPhone('1004'),
        })
        .expect(409);
    });

    it('recusa horário fora do expediente, mesmo forjado no corpo', async () => {
      // 03:00 local — nunca ofertado pela grade.
      const dawn = new Date(`${targetDate}T06:00:00.000Z`).toISOString();

      await api()
        .post(url(`/public/${slugA}/appointments`))
        .send({
          serviceIds: [corteId],
          barberId: carlosId,
          startsAt: dawn,
          guestName: 'Visitante Madrugada',
          guestPhone: guestPhone('1005'),
        })
        .expect(409);
    });

    it('exige nome e WhatsApp de quem não tem conta', async () => {
      const slot = await firstSlot([corteId], carlosId);

      await api()
        .post(url(`/public/${slugA}/appointments`))
        .send({ serviceIds: [corteId], barberId: carlosId, startsAt: slot.startsAt })
        .expect(400);
    });

    it('recusa WhatsApp inválido', async () => {
      const slot = await firstSlot([corteId], carlosId);

      await api()
        .post(url(`/public/${slugA}/appointments`))
        .send({
          serviceIds: [corteId],
          barberId: carlosId,
          startsAt: slot.startsAt,
          guestName: 'Visitante',
          guestPhone: '123',
        })
        .expect(400);
    });

    /**
     * O caso que a fase existe para provar. Dois pedidos disparados juntos para
     * o mesmo barbeiro e horário: os dois passam pela validação de grade (ambos
     * consultaram antes de qualquer gravação), e só um chega ao fim.
     */
    it('corrida de slot: dois pedidos simultâneos, só um vence', async () => {
      const slot = await firstSlot([corteId], carlosId);

      const attempt = (suffix: string) =>
        api()
          .post(url(`/public/${slugA}/appointments`))
          .send({
            serviceIds: [corteId],
            barberId: carlosId,
            startsAt: slot.startsAt,
            guestName: `Corrida ${suffix}`,
            guestPhone: guestPhone(suffix),
          });

      const [first, second] = await Promise.all([attempt('2001'), attempt('2002')]);
      const statuses = [first.status, second.status].sort();

      expect(statuses).toEqual([201, 409]);

      const loser = first.status === 409 ? first : second;
      expect(loser.body.code).toBe('DOUBLE_BOOKING');
      expect(loser.body.message).toContain('horário');

      // E o banco tem exatamente um atendimento ativo naquele instante.
      const booked = await prisma.appointment.count({
        where: {
          tenantId: tenantAId,
          barberId: carlosId,
          startsAt: new Date(slot.startsAt),
          status: { notIn: ['CANCELED', 'NO_SHOW'] },
        },
      });
      expect(booked).toBe(1);
    });
  });

  // ── Cancelamento e remarcação ─────────────────────────────────────────────

  describe('cancelamento e remarcação', () => {
    async function bookGuest(suffix: string) {
      const slot = await firstSlot([corteId], carlosId);
      const response = await api()
        .post(url(`/public/${slugA}/appointments`))
        .send({
          serviceIds: [corteId],
          barberId: carlosId,
          startsAt: slot.startsAt,
          guestName: `Visitante ${suffix}`,
          guestPhone: guestPhone(suffix),
        })
        .expect(201);
      return { code: response.body.appointment.bookingCode as string, phone: guestPhone(suffix) };
    }

    it('consulta pelo código quando o telefone confere', async () => {
      const { code, phone } = await bookGuest('3001');

      const response = await api()
        .get(url(`/public/${slugA}/appointments/${code}`))
        .query({ phone })
        .expect(200);

      expect(response.body.bookingCode).toBe(code);
      expect(response.body.cancelable).toBe(true);
    });

    it('esconde a reserva de quem tem o código mas não o telefone', async () => {
      const { code } = await bookGuest('3002');

      await api()
        .get(url(`/public/${slugA}/appointments/${code}`))
        .query({ phone: guestPhone('9999') })
        .expect(404);

      await api().get(url(`/public/${slugA}/appointments/${code}`)).expect(404);
    });

    it('cancela e devolve o horário à grade', async () => {
      const { code, phone } = await bookGuest('3003');

      const before = await api()
        .get(url(`/public/${slugA}/appointments/${code}`))
        .query({ phone })
        .expect(200);

      const cancel = await api()
        .post(url(`/public/${slugA}/appointments/${code}/cancel`))
        .send({ phone, reason: 'imprevisto' })
        .expect(200);

      expect(cancel.body.status).toBe('CANCELED');

      const availability = await api()
        .get(url(`/public/${slugA}/availability`))
        .query({ serviceIds: corteId, barberId: carlosId, date: targetDate })
        .expect(200);

      expect(
        availability.body.slots.map((slot: { startsAt: string }) => slot.startsAt),
      ).toContain(before.body.startsAt);
    });

    it('remarca para outro horário livre', async () => {
      const { code, phone } = await bookGuest('3004');

      const grid = await api()
        .get(url(`/public/${slugA}/availability`))
        .query({ serviceIds: corteId, barberId: carlosId, date: targetDate })
        .expect(200);

      const target = grid.body.slots[grid.body.slots.length - 1];

      const response = await api()
        .post(url(`/public/${slugA}/appointments/${code}/reschedule`))
        .send({ phone, startsAt: target.startsAt })
        .expect(200);

      expect(response.body.startsAt).toBe(target.startsAt);
      expect(response.body.bookingCode).toBe(code);
    });

    it('não cancela agendamento de outra barbearia com o mesmo código', async () => {
      const { code, phone } = await bookGuest('3005');

      await api()
        .post(url(`/public/${slugB}/appointments/${code}/cancel`))
        .send({ phone })
        .expect(404);
    });

    it('recusa cancelamento fora da janela do tenant', async () => {
      const { code, phone } = await bookGuest('3006');

      // Empurra o horário para daqui a 1h — a janela do tenant é de 2h.
      await prisma.appointment.updateMany({
        where: { tenantId: tenantAId, bookingCode: code },
        data: { startsAt: new Date(Date.now() + 3_600_000), endsAt: new Date(Date.now() + 5_400_000) },
      });

      const response = await api()
        .post(url(`/public/${slugA}/appointments/${code}/cancel`))
        .send({ phone })
        .expect(409);

      // A mensagem cita o valor configurado, não um "3h" escrito na tela.
      expect(response.body.message).toContain('2h antes');
    });
  });

  // ── Guest booking com verificação ─────────────────────────────────────────

  describe('OTP condicional do guest booking', () => {
    /**
     * O caminho verificado carrega a seleção inteira até a confirmação — e a
     * seleção aqui é a que vira combo, porque é nela que a duração muda (70 min
     * em vez dos 75 da soma das peças). Conferir a grade com a duração errada
     * recusaria horários que cabem.
     */
    it('exige código quando o telefone já é de conta verificada, e preserva o combo', async () => {
      const phone = `55169${run}1`.slice(0, 13);

      const client = await prisma.client.create({
        data: { phone, name: 'Cliente Verificado', phoneVerifiedAt: new Date() },
        select: { id: true },
      });

      try {
        const slot = await firstSlot([corteId, barbaId], brunoId);

        const started = await api()
          .post(url(`/public/${slugA}/appointments`))
          .send({
            serviceIds: [corteId, barbaId],
            barberId: brunoId,
            startsAt: slot.startsAt,
            guestName: 'Cliente Verificado',
            guestPhone: phone,
          })
          .expect(201);

        expect(started.body.kind).toBe('otp-required');
        expect(started.body.destinationMasked).toContain('****');

        // O código sai pelo mesmo outbox que o dev consultaria — sem atalho de teste.
        const outbox = await prisma.notificationOutbox.findFirst({
          where: { recipient: phone },
          orderBy: { createdAt: 'desc' },
          select: { body: true },
        });
        const code = /\b(\d{6})\b/.exec(outbox?.body ?? '')?.[1];
        expect(code).toBeDefined();

        const confirmed = await api()
          .post(url(`/public/${slugA}/appointments/confirm`))
          .send({ challengeId: started.body.challengeId, code })
          .expect(201);

        expect(confirmed.body.kind).toBe('confirmed');
        expect(confirmed.body.appointment.startsAt).toBe(slot.startsAt);
        expect(confirmed.body.appointment.services).toHaveLength(1);
        expect(confirmed.body.appointment.services[0].name).toBe('Corte + Barba');
        expect(confirmed.body.appointment.totalPriceCents).toBe(7_000);
      } finally {
        await prisma.client.delete({ where: { id: client.id } });
      }
    });

    it('recusa o código reaproveitado — o desafio é de uso único', async () => {
      const phone = `55169${run}3`.slice(0, 13);

      const client = await prisma.client.create({
        data: { phone, name: 'Reuso Verificado', phoneVerifiedAt: new Date() },
        select: { id: true },
      });

      try {
        const slot = await firstSlot([corteId], brunoId);

        const started = await api()
          .post(url(`/public/${slugA}/appointments`))
          .send({
            serviceIds: [corteId],
            barberId: brunoId,
            startsAt: slot.startsAt,
            guestName: 'Reuso Verificado',
            guestPhone: phone,
          })
          .expect(201);

        const outbox = await prisma.notificationOutbox.findFirst({
          where: { recipient: phone },
          orderBy: { createdAt: 'desc' },
          select: { body: true },
        });
        const code = /\b(\d{6})\b/.exec(outbox?.body ?? '')?.[1];

        await api()
          .post(url(`/public/${slugA}/appointments/confirm`))
          .send({ challengeId: started.body.challengeId, code })
          .expect(201);

        // Repetir o mesmo par challenge+código não pode gerar um segundo horário.
        await api()
          .post(url(`/public/${slugA}/appointments/confirm`))
          .send({ challengeId: started.body.challengeId, code })
          .expect(400);
      } finally {
        await prisma.client.delete({ where: { id: client.id } });
      }
    });

    it('recusa código errado', async () => {
      const phone = `55169${run}2`.slice(0, 13);

      const client = await prisma.client.create({
        data: { phone, name: 'Outro Verificado', phoneVerifiedAt: new Date() },
        select: { id: true },
      });

      try {
        const slot = await firstSlot([corteId], brunoId);

        const started = await api()
          .post(url(`/public/${slugA}/appointments`))
          .send({
            serviceIds: [corteId],
            barberId: brunoId,
            startsAt: slot.startsAt,
            guestName: 'Outro Verificado',
            guestPhone: phone,
          })
          .expect(201);

        const response = await api()
          .post(url(`/public/${slugA}/appointments/confirm`))
          .send({ challengeId: started.body.challengeId, code: '000000' })
          .expect(400);

        expect(response.body.code).toBe('OTP_INVALID');
      } finally {
        await prisma.client.delete({ where: { id: client.id } });
      }
    });
  });
});
