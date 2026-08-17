import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { TENANT_HEADER } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CONFIG, type AppConfig } from '../../src/config/configuration';
import {
  disconnectIsolationFixture,
  setupIsolationFixture,
  type IsolatedTenant,
  type IsolationFixture,
} from './tenant-fixture';

/**
 * Isolamento de tenant no booking público (fase 04).
 *
 * A superfície desta fase é a mais exposta do produto: rotas ANÔNIMAS, com a
 * barbearia identificada por um slug que qualquer pessoa digita. Se existisse
 * um jeito de fazer o slug A responder com dado de B — ou de gravar em B
 * passando por A —, seria aqui.
 *
 * Os ataques cobertos são os três caminhos que um cliente HTTP tem: trocar o
 * slug da URL, mandar id de outro tenant no corpo/query, e contrabandear o
 * header `x-tenant-slug`.
 */
describe('isolamento de tenant — booking público (fase 04)', () => {
  let fixture: IsolationFixture;
  let app: INestApplication;
  let prefix: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  /**
   * O arnês nasce sem expediente (ele existe para provar isolamento no banco,
   * não para gerar grade). O booking precisa de horário de funcionamento e de
   * agenda do barbeiro, então cada tenant do fixture ganha os seus aqui.
   */
  async function giveOpeningHours(tenant: IsolatedTenant): Promise<void> {
    await fixture.prisma.tenantBusinessHour.createMany({
      data: [
        { tenantId: tenant.id, weekday: 0, opensAt: 0, closesAt: 0, closed: true },
        ...[1, 2, 3, 4, 5, 6].map((weekday) => ({
          tenantId: tenant.id,
          weekday,
          opensAt: 9 * 60,
          closesAt: 20 * 60,
          closed: false,
        })),
      ],
    });

    await fixture.prisma.workSchedule.createMany({
      data: [
        {
          tenantId: tenant.id,
          barberId: tenant.barberId,
          weekday: 0,
          startTime: 9 * 60,
          endTime: 18 * 60,
          isDayOff: true,
        },
        ...[1, 2, 3, 4, 5, 6].map((weekday) => ({
          tenantId: tenant.id,
          barberId: tenant.barberId,
          weekday,
          startTime: 9 * 60,
          endTime: 20 * 60,
          isDayOff: false,
        })),
      ],
    });

    await fixture.prisma.tenantSettings.update({
      where: { tenantId: tenant.id },
      data: { antecedenciaMinima: 30 },
    });
  }

  /** Um horário livre do tenant informado, dois dias à frente. */
  async function freeSlot(tenant: IsolatedTenant) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 2);
    if (date.getUTCDay() === 0) {
      date.setUTCDate(date.getUTCDate() + 1);
    }

    const response = await api()
      .get(url(`/public/${tenant.slug}/availability`))
      .query({ serviceIds: tenant.serviceId, date: date.toISOString().slice(0, 10) })
      .expect(200);

    const slot = response.body.slots.at(-1);
    expect(slot).toBeDefined();
    return slot as { startsAt: string };
  }

  const guest = (suffix: string) => ({
    guestName: `Visitante ${suffix}`,
    guestPhone: `(16) 9 7${suffix}-1234`,
  });

  beforeAll(async () => {
    fixture = await setupIsolationFixture();

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

    await giveOpeningHours(fixture.a);
    await giveOpeningHours(fixture.b);
  });

  afterAll(async () => {
    await app.close();
    await fixture.teardown();
    await disconnectIsolationFixture();
  });

  // ── Leitura ───────────────────────────────────────────────────────────────

  it('a página de A não devolve serviço, barbeiro nem plano de B', async () => {
    const response = await api().get(url(`/public/${fixture.a.slug}`)).expect(200);

    const serviceIds = response.body.services.map((service: { id: string }) => service.id);
    const barberIds = response.body.barbers.map((barber: { id: string }) => barber.id);

    expect(serviceIds).toEqual([fixture.a.serviceId]);
    expect(serviceIds).not.toContain(fixture.b.serviceId);
    expect(barberIds).toEqual([fixture.a.barberId]);
    expect(barberIds).not.toContain(fixture.b.barberId);
    expect(response.body.slug).toBe(fixture.a.slug);
  });

  it('a cotação de A recusa serviço de B em vez de precificá-lo', async () => {
    await api()
      .get(url(`/public/${fixture.a.slug}/quote`))
      .query({ serviceIds: fixture.b.serviceId })
      .expect(400);
  });

  it('a grade de A com barbeiro de B não oferece horário nenhum', async () => {
    const response = await api()
      .get(url(`/public/${fixture.a.slug}/availability`))
      .query({ serviceIds: fixture.a.serviceId, barberId: fixture.b.barberId })
      .expect(200);

    expect(response.body.slots).toEqual([]);
    expect(response.body.days.every((day: { closed: boolean }) => day.closed)).toBe(true);
  });

  it('a grade de A recusa serviço de B', async () => {
    await api()
      .get(url(`/public/${fixture.a.slug}/availability`))
      .query({ serviceIds: fixture.b.serviceId })
      .expect(400);
  });

  // ── Escrita ───────────────────────────────────────────────────────────────

  it('não agenda em A com serviço de B', async () => {
    const slot = await freeSlot(fixture.a);

    await api()
      .post(url(`/public/${fixture.a.slug}/appointments`))
      .send({ serviceIds: [fixture.b.serviceId], startsAt: slot.startsAt, ...guest('001') })
      .expect(400);
  });

  it('não agenda em A com barbeiro de B', async () => {
    const slot = await freeSlot(fixture.a);

    await api()
      .post(url(`/public/${fixture.a.slug}/appointments`))
      .send({
        serviceIds: [fixture.a.serviceId],
        barberId: fixture.b.barberId,
        startsAt: slot.startsAt,
        ...guest('002'),
      })
      .expect(409);

    // E nada foi gravado do lado de B.
    const rows = await fixture.prisma.appointment.findMany({
      where: { barberId: fixture.b.barberId, guestName: 'Visitante 002' },
      select: { tenantId: true },
    });
    expect(rows).toEqual([]);
  });

  it('o agendamento nasce carimbado no tenant do slug, e só nele', async () => {
    const slot = await freeSlot(fixture.a);

    const response = await api()
      .post(url(`/public/${fixture.a.slug}/appointments`))
      .send({ serviceIds: [fixture.a.serviceId], startsAt: slot.startsAt, ...guest('003') })
      .expect(201);

    const created = await fixture.prisma.appointment.findMany({
      where: { bookingCode: response.body.appointment.bookingCode },
      select: { tenantId: true },
    });

    expect(created).toHaveLength(1);
    fixture.expectOnlyTenant(created, fixture.a);

    const lines = await fixture.prisma.appointmentService.findMany({
      where: { appointment: { bookingCode: response.body.appointment.bookingCode } },
      select: { tenantId: true },
    });
    fixture.expectOnlyTenant(lines, fixture.a);
  });

  /**
   * A precedência do param de rota sobre o header já foi estabelecida na fase
   * 03. Aqui o que importa é a consequência: contrabandear o header do vizinho
   * não move a gravação para lá.
   */
  it('o header x-tenant-slug não desvia a gravação para outra barbearia', async () => {
    const slot = await freeSlot(fixture.a);

    const response = await api()
      .post(url(`/public/${fixture.a.slug}/appointments`))
      .set(TENANT_HEADER, fixture.b.slug)
      .send({ serviceIds: [fixture.a.serviceId], startsAt: slot.startsAt, ...guest('004') })
      .expect(201);

    const created = await fixture.prisma.appointment.findMany({
      where: { bookingCode: response.body.appointment.bookingCode },
      select: { tenantId: true },
    });

    fixture.expectOnlyTenant(created, fixture.a);
  });

  // ── Consulta e alteração pelo código ──────────────────────────────────────

  it('o código de reserva de A não abre nada pelo slug de B', async () => {
    const slot = await freeSlot(fixture.a);
    const { guestPhone, guestName } = guest('005');

    const created = await api()
      .post(url(`/public/${fixture.a.slug}/appointments`))
      .send({ serviceIds: [fixture.a.serviceId], startsAt: slot.startsAt, guestName, guestPhone })
      .expect(201);

    const code = created.body.appointment.bookingCode as string;

    // Pelo slug certo, com o telefone certo: abre.
    await api()
      .get(url(`/public/${fixture.a.slug}/appointments/${code}`))
      .query({ phone: guestPhone })
      .expect(200);

    // Pelo slug do vizinho: não existe, com a mesma resposta de código inválido.
    await api()
      .get(url(`/public/${fixture.b.slug}/appointments/${code}`))
      .query({ phone: guestPhone })
      .expect(404);

    await api()
      .post(url(`/public/${fixture.b.slug}/appointments/${code}/cancel`))
      .send({ phone: guestPhone })
      .expect(404);

    await api()
      .post(url(`/public/${fixture.b.slug}/appointments/${code}/reschedule`))
      .send({ phone: guestPhone, startsAt: slot.startsAt })
      .expect(404);

    // E o agendamento seguiu intocado em A.
    const untouched = await fixture.prisma.appointment.findFirst({
      where: { tenantId: fixture.a.id, bookingCode: code },
      select: { status: true },
    });
    expect(untouched?.status).toBe('SCHEDULED');
  });

  it('o agendamento que já existia em B nunca aparece nas consultas de A', async () => {
    const rows = await fixture.prisma.appointment.findMany({
      where: { tenantId: fixture.a.id },
      select: { tenantId: true, id: true },
    });

    fixture.expectOnlyTenant(rows, fixture.a);
    expect(rows.map((row) => row.id)).not.toContain(fixture.b.appointmentId);
  });
});
