import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import {
  AppointmentStatus,
  MembershipRole,
  PaymentMethod,
  PrismaClient,
  WhatsappEvent,
} from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Aba Relatórios (agente 20) de ponta a ponta.
 *
 * O fio condutor é o desvio que abriu a auditoria: o protótipo NÃO tranca
 * "Faturamento por barbeiro", e a implementação anterior o servia dentro do
 * endpoint gated. Por isso quase todo caso aqui pergunta a mesma coisa de dois
 * ângulos — o que o Essencial vê e o que ele não vê.
 */
describe('relatórios (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-rel-${run}`;
  const essencialSlug = `e2e-rel-ess-${run}`;
  const password = 'RelatoriosSenha1!';
  const TZ = 'America/Sao_Paulo';

  let tenantId: string;
  let essencialTenantId: string;
  let ownerToken: string;
  let barberToken: string;
  let essencialToken: string;
  let barberA: string;
  let barberB: string;
  let unitId: string;
  let serviceId: string;
  let orderNumber = 0;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const bearer = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
  });
  const asOwner = () => bearer(ownerToken);

  /** Meia-noite local + `hour` — o mesmo relógio que o serviço usa. */
  const localAt = (dayOffset: number, hour: number): Date => {
    const now = new Date();
    const key = new Date(now.getTime() - 3 * 3_600_000); // São Paulo = UTC-3.
    key.setUTCDate(key.getUTCDate() + dayOffset);
    return new Date(
      Date.UTC(key.getUTCFullYear(), key.getUTCMonth(), key.getUTCDate(), hour + 3, 0, 0),
    );
  };

  const closeOrder = async (input: {
    barberId: string;
    closedAt: Date;
    totalCents: number;
    method: PaymentMethod;
    unitId?: string;
  }): Promise<void> => {
    orderNumber += 1;
    const order = await prisma.order.create({
      data: {
        tenantId,
        barberId: input.barberId,
        unitId: input.unitId ?? null,
        number: orderNumber,
        status: 'CLOSED',
        subtotalCents: input.totalCents,
        totalCents: input.totalCents,
        openedAt: input.closedAt,
        closedAt: input.closedAt,
        items: {
          create: {
            tenantId,
            kind: 'SERVICE',
            serviceId,
            barberId: input.barberId,
            description: 'Corte Rel',
            quantity: 1,
            unitPriceCents: input.totalCents,
            totalCents: input.totalCents,
          },
        },
        payments: {
          create: {
            tenantId,
            method: input.method,
            status: 'PAID',
            amountCents: input.totalCents,
            paidAt: input.closedAt,
          },
        },
      },
      select: { id: true },
    });
    expect(order.id).toBeTruthy();
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const [avancado, essencial] = await Promise.all([
      prisma.saasPlan.create({
        data: {
          code: `e2e-rel-avancado-${run}`,
          name: 'Avançado (e2e rel)',
          priceCents: 13_900,
          tier: PlanTier.AVANCADO,
          maxBarbers: null,
          features: featuresForTier(PlanTier.AVANCADO) as unknown as object,
        },
        select: { id: true },
      }),
      prisma.saasPlan.create({
        data: {
          code: `e2e-rel-essencial-${run}`,
          name: 'Essencial (e2e rel)',
          priceCents: 4_900,
          tier: PlanTier.ESSENCIAL,
          maxBarbers: 3,
          features: featuresForTier(PlanTier.ESSENCIAL) as unknown as object,
        },
        select: { id: true },
      }),
    ]);

    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: 'Barbearia Relatórios (e2e)',
        timezone: TZ,
        planId: avancado.id,
        settings: { create: { allowOnlineBooking: true } },
        businessHours: {
          create: Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            opensAt: 9 * 60,
            closesAt: 20 * 60,
            closed: false,
          })),
        },
        // O marcador "WhatsApp de lembrete ativado" do gráfico de faltas sai
        // daqui — sem `enabledAt` não há linha tracejada nenhuma.
        whatsappConfigs: {
          create: {
            event: WhatsappEvent.REMINDER,
            enabled: true,
            enabledAt: monthsAgo(3),
            template: 'Lembrete {nome}',
            offsetMinutes: 1_440,
          },
        },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const essencialTenant = await prisma.tenant.create({
      data: {
        slug: essencialSlug,
        name: 'Barbearia Essencial (e2e rel)',
        timezone: TZ,
        planId: essencial.id,
        settings: { create: { allowOnlineBooking: true } },
      },
      select: { id: true },
    });
    essencialTenantId = essencialTenant.id;

    const unit = await prisma.unit.create({
      data: { tenantId, name: 'Unidade Centro (e2e rel)' },
      select: { id: true },
    });
    unitId = unit.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-rel-owner-${run}@barbervp.test`;
    const barberEmail = `e2e-rel-barber-${run}@barbervp.test`;
    const essencialEmail = `e2e-rel-ess-${run}@barbervp.test`;

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dono Rel',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });
    await prisma.user.create({
      data: {
        email: essencialEmail,
        name: 'Dono Essencial Rel',
        passwordHash,
        memberships: { create: { tenantId: essencialTenantId, role: MembershipRole.OWNER } },
      },
    });
    const barberUser = await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro A Rel',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
      select: { id: true },
    });

    const [a, b] = await Promise.all([
      prisma.barber.create({
        data: { tenantId, userId: barberUser.id, name: 'Barbeiro A Rel' },
        select: { id: true },
      }),
      prisma.barber.create({ data: { tenantId, name: 'Barbeiro B Rel' }, select: { id: true } }),
    ]);
    barberA = a.id;
    barberB = b.id;

    const service = await prisma.service.create({
      data: { tenantId, name: 'Corte Rel', durationMin: 30, priceCents: 5_000 },
      select: { id: true },
    });
    serviceId = service.id;

    // ── Faturamento ──────────────────────────────────────────────────────
    // Hoje: A fatura 100 (Pix) e B fatura 300 (Dinheiro) → 400 no total.
    await closeOrder({ barberId: barberA, closedAt: localAt(0, 10), totalCents: 10_000, method: 'PIX' });
    await closeOrder({
      barberId: barberB,
      closedAt: localAt(0, 11),
      totalCents: 30_000,
      method: 'CASH',
      unitId,
    });
    // Ontem: 200 — a base do delta de "Hoje" (400 vs 200 = +100%).
    await closeOrder({ barberId: barberA, closedAt: localAt(-1, 10), totalCents: 20_000, method: 'PIX' });

    // ── Agenda: pico plantado nas TRÊS últimas quartas-feiras às 14h ─────
    // Três agendamentos no mesmo instante violariam a EXCLUDE
    // `no_double_booking`; três quartas seguidas é o que o heatmap agrega de
    // qualquer forma (dia da semana × hora).
    const wednesday = wednesdayOffset();
    for (let index = 0; index < 3; index += 1) {
      await prisma.appointment.create({
        data: {
          tenantId,
          barberId: barberA,
          serviceId,
          bookingCode: `REL-${run}-${index}`,
          guestName: 'Visitante Rel',
          guestPhone: `5511900${index}${run}`.slice(0, 15),
          startsAt: localAt(wednesday - index * 7, 14),
          endsAt: localAt(wednesday - index * 7, 15),
          status: AppointmentStatus.DONE,
          priceCents: 5_000,
        },
      });
    }

    const loginOwner = await api().post(url('/auth/login')).send({ email: ownerEmail, password }).expect(200);
    ownerToken = loginOwner.body.accessToken;
    const loginBarber = await api().post(url('/auth/login')).send({ email: barberEmail, password }).expect(200);
    barberToken = loginBarber.body.accessToken;
    const loginEssencial = await api()
      .post(url('/auth/login'))
      .send({ email: essencialEmail, password })
      .expect(200);
    essencialToken = loginEssencial.body.accessToken;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, essencialSlug] } } });
    await prisma.saasPlan.deleteMany({
      where: { code: { in: [`e2e-rel-avancado-${run}`, `e2e-rel-essencial-${run}`] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Período ────────────────────────────────────────────────────────────

  it('as 5 pílulas resolvem janelas no fuso da barbearia', async () => {
    const hoje = await asOwner().get('/reports/summary?period=hoje').expect(200);
    expect(hoje.body.period.from).toBe(hoje.body.period.to);
    expect(hoje.body.revenueCents).toBe(40_000);

    const sete = await asOwner().get('/reports/summary?period=7d').expect(200);
    expect(sete.body.revenueSeries).toHaveLength(7);
    expect(sete.body.revenueSeries.map((point: { label: string }) => point.label)).toEqual(
      expect.arrayContaining(['Seg']),
    );

    const trinta = await asOwner().get('/reports/summary?period=30d').expect(200);
    expect(trinta.body.revenueSeries).toHaveLength(30);
    expect(trinta.body.revenueCents).toBe(60_000);
  });

  it('"hoje" é por hora, e as horas são as do expediente cadastrado', async () => {
    const response = await asOwner().get('/reports/summary?period=hoje').expect(200);
    const labels = response.body.revenueSeries.map((point: { label: string }) => point.label);
    expect(labels[0]).toBe('09h');
    expect(labels).toContain('20h');
    const dezHoras = response.body.revenueSeries.find(
      (point: { label: string }) => point.label === '10h',
    );
    expect(dezHoras.revenueCents).toBe(10_000);
  });

  it('o delta compara com a janela de MESMO tamanho imediatamente anterior', async () => {
    const response = await asOwner().get('/reports/summary?period=hoje').expect(200);
    expect(response.body.previousRevenueCents).toBe(20_000);
    expect(response.body.deltaPct).toBe(100);
  });

  it('período personalizado exige as duas datas e recusa intervalo invertido', async () => {
    await asOwner().get('/reports/summary?period=custom').expect(400);
    await asOwner().get('/reports/summary?period=custom&from=2026-08-10&to=2026-08-01').expect(400);
    const ok = await asOwner()
      .get('/reports/summary?period=custom&from=2026-08-01&to=2026-08-03')
      .expect(200);
    expect(ok.body.revenueSeries).toHaveLength(3);
  });

  // ── Blocos abertos ─────────────────────────────────────────────────────

  it('a rosca reparte EXATAMENTE o faturamento do card acima dela', async () => {
    const response = await asOwner().get('/reports/summary?period=hoje').expect(200);
    const total = response.body.paymentDistribution.reduce(
      (sum: number, entry: { amountCents: number }) => sum + entry.amountCents,
      0,
    );
    expect(total).toBe(response.body.revenueCents);
  });

  it('o ticket médio da tabela bate com o KPI: faturamento ÷ comandas', async () => {
    const [summary, advanced] = await Promise.all([
      asOwner().get('/reports/summary?period=hoje').expect(200),
      asOwner().get('/reports/advanced?period=hoje').expect(200),
    ]);
    const somaTicket = advanced.body.ticketByBarber.reduce(
      (sum: number, row: { orders: number; ticketCents: number }) => sum + row.orders * row.ticketCents,
      0,
    );
    expect(somaTicket).toBe(summary.body.revenueCents);
    expect(summary.body.averageTicketCents).toBe(
      Math.round(summary.body.revenueCents / summary.body.orders),
    );
  });

  it('o filtro de barbeiro recorta faturamento, rosca e serviços', async () => {
    const response = await asOwner()
      .get(`/reports/summary?period=hoje&barberIds=${barberA}`)
      .expect(200);
    expect(response.body.revenueCents).toBe(10_000);
    expect(response.body.revenueByBarber).toHaveLength(1);
    expect(response.body.paymentDistribution).toEqual([
      expect.objectContaining({ method: 'PIX', amountCents: 10_000, pct: 100 }),
    ]);
  });

  it('o filtro de unidade recorta pelo `unitId` da comanda', async () => {
    const response = await asOwner().get(`/reports/summary?period=hoje&unitId=${unitId}`).expect(200);
    expect(response.body.revenueCents).toBe(30_000);
    expect(response.body.revenueByBarber).toEqual([
      expect.objectContaining({ barberId: barberB }),
    ]);
  });

  // ── Blocos com cadeado ─────────────────────────────────────────────────

  it('as faixas de retorno são as 4 do protótipo e o headline soma as três primeiras', async () => {
    const response = await asOwner().get('/reports/advanced?period=30d').expect(200);
    expect(response.body.returnRate.buckets.map((bucket: { label: string }) => bucket.label)).toEqual([
      '0–15 dias',
      '16–30 dias',
      '31–45 dias',
      '46+ dias / não voltou',
    ]);
    expect(response.body.returnRate.withinDays).toBe(45);
    const primeiras = response.body.returnRate.buckets
      .slice(0, 3)
      .reduce((sum: number, bucket: { clients: number }) => sum + bucket.clients, 0);
    const total = response.body.returnRate.clients;
    expect(response.body.returnRate.headlinePct).toBe(
      total > 0 ? Math.round((primeiras / total) * 100) : 0,
    );
  });

  it('o heatmap tem 7 dias × 14 horas e aponta o pico onde os atendimentos estão', async () => {
    const response = await asOwner().get('/reports/advanced?period=30d').expect(200);
    expect(response.body.heatmap.hours).toHaveLength(14);
    expect(response.body.heatmap.hours[0]).toBe(8);
    expect(response.body.heatmap.rows).toHaveLength(7);
    expect(response.body.heatmap.rows[0].cells).toHaveLength(14);
    // Os 3 atendimentos plantados caem numa quarta às 14h.
    expect(response.body.heatmap.peakLabel).toContain('quarta-feira');
    const quarta = response.body.heatmap.rows.find((row: { weekday: number }) => row.weekday === 3);
    const catorze = quarta.cells.find((cell: { hour: number }) => cell.hour === 14);
    expect(catorze.appointments).toBe(3);
    expect(catorze.intensity).toBe(1);
  });

  it('a taxa de faltas traz 8 meses e marca o mês em que o lembrete foi ligado', async () => {
    const response = await asOwner().get('/reports/advanced?period=30d').expect(200);
    expect(response.body.noShowTrend.points).toHaveLength(8);
    // `enabledAt` = 3 meses atrás; em 8 meses terminando no mês corrente, é o índice 4.
    expect(response.body.noShowTrend.whatsappActivatedIndex).toBe(4);
  });

  // ── Gate de plano ──────────────────────────────────────────────────────

  it('Essencial VÊ o faturamento por barbeiro — o protótipo não tranca esse bloco', async () => {
    const response = await bearer(essencialToken).get('/reports/summary?period=30d').expect(200);
    expect(response.body).toHaveProperty('revenueByBarber');
    expect(response.body).toHaveProperty('paymentDistribution');
    expect(response.body).toHaveProperty('revenueSeries');
  });

  it.each([['/reports/advanced'], ['/reports/export.csv'], ['/reports/export.pdf']])(
    'Essencial recebe 403 em %s',
    async (path) => {
      await bearer(essencialToken).get(`${path}?period=30d`).expect(403);
    },
  );

  // ── Papel BARBER ───────────────────────────────────────────────────────

  it('BARBER entra na aba, com a resposta marcada como recorte próprio', async () => {
    const response = await bearer(barberToken).get('/reports/summary?period=hoje').expect(200);
    expect(response.body.scoped).toBe(true);
    expect(response.body.revenueCents).toBe(10_000);
    expect(response.body.revenueByBarber).toEqual([
      expect.objectContaining({ barberId: barberA }),
    ]);
  });

  it('BARBER pedindo o id de um colega continua vendo os PRÓPRIOS números', async () => {
    const response = await bearer(barberToken)
      .get(`/reports/summary?period=hoje&barberIds=${barberB}`)
      .expect(200);
    expect(response.body.revenueCents).toBe(10_000);
    expect(JSON.stringify(response.body)).not.toContain(barberB);
  });

  // ── Exportação ─────────────────────────────────────────────────────────

  it('"Exportar CSV" devolve uma planilha com o mesmo faturamento da tela', async () => {
    const response = await asOwner().get('/reports/export.csv?period=hoje').expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment; filename="relatorio-');
    const text = response.text;
    expect(text).toContain('Faturamento;400,00');
    expect(text).toContain('Ticket médio por barbeiro');
  });

  it('"Exportar PDF" devolve um PDF de verdade', async () => {
    const response = await asOwner()
      .get('/reports/export.pdf?period=hoje')
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect((response.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

/** Quantos dias até a próxima quarta-feira PASSADA dentro dos últimos 30 dias. */
function wednesdayOffset(): number {
  // O dia da semana tem de sair do MESMO relógio que `localAt` usa (São Paulo
  // = UTC-3), não de `getUTCDay()`: das 21h à meia-noite local o UTC já virou
  // o dia seguinte, e o offset caía numa terça. O caso quebrava só nesse
  // intervalo — flaky de três horas por dia.
  const today = new Date(Date.now() - 3 * 3_600_000);
  const weekday = today.getUTCDay();
  // 3 = quarta. Volta para a quarta mais recente (sem cair em hoje).
  const back = ((weekday - 3 + 7) % 7) || 7;
  return -back;
}

function monthsAgo(count: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - count);
  return date;
}
