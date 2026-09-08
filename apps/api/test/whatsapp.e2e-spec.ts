import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { MembershipRole, PrismaClient } from '@prisma/client';
import {
  PlanTier,
  WHATSAPP_DEFAULT_TEMPLATES,
  WHATSAPP_EVENT_ORDER,
  WHATSAPP_REMINDER_OPTIONS_MINUTES,
  featuresForTier,
} from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { WhatsappAutomationsService } from '../src/queue/jobs/whatsapp-automations.service';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Aba WhatsApp (fase 22) de ponta a ponta.
 *
 * O que estes casos protegem, em ordem de importância:
 *  1. a aba abre INTEIRA num tenant que nunca a configurou (era o defeito que
 *     deixava a lista de automações vazia em toda barbearia nova);
 *  2. o gate de `whatsappCompleto` é do SERVIDOR, e vale também para editar
 *     template, não só para ligar o interruptor;
 *  3. o disparo em massa passa pelo `NotificationAdapter` e reaparece no
 *     histórico — que é a única prova de envio enquanto o driver é mock.
 */
describe('aba WhatsApp — automações, reativação e histórico (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-wa-${run}`;
  const slugBasico = `e2e-wa-basico-${run}`;
  const password = 'WhatsappSenhaForte1!';

  let tenantId: string;
  let ownerToken: string;
  let barberToken: string;
  let basicoToken: string;
  /** Cliente inativo que ACEITA mensagens — deve receber. */
  let inativoId: string;
  /** Cliente inativo que RECUSA mensagens — deve entrar em `skipped`. */
  let recusaId: string;
  /** Cliente que veio ontem — não é alvo de reativação. */
  let ativoId: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${token}`),
  });
  const asOwner = () => as(ownerToken);

  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1_000);

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

    const [avancado, essencial] = await Promise.all([
      prisma.saasPlan.create({
        data: {
          code: `e2e-wa-avancado-${run}`,
          name: 'Avançado (e2e wa)',
          priceCents: 13_900,
          tier: PlanTier.AVANCADO,
          maxBarbers: null,
          features: featuresForTier(PlanTier.AVANCADO) as unknown as object,
        },
        select: { id: true },
      }),
      prisma.saasPlan.create({
        data: {
          code: `e2e-wa-essencial-${run}`,
          name: 'Essencial (e2e wa)',
          priceCents: 4_900,
          tier: PlanTier.ESSENCIAL,
          maxBarbers: 2,
          features: featuresForTier(PlanTier.ESSENCIAL) as unknown as object,
        },
        select: { id: true },
      }),
    ]);

    const tenant = await prisma.tenant.create({
      data: { slug, name: 'Barbearia WhatsApp (e2e)', planId: avancado.id },
      select: { id: true },
    });
    tenantId = tenant.id;

    const tenantBasico = await prisma.tenant.create({
      data: { slug: slugBasico, name: 'Barbearia Essencial (e2e)', planId: essencial.id },
      select: { id: true },
    });

    // Catálogo e equipe existem para que o `sample` do preview tenha de onde
    // sair — é justamente o que substitui o "João Pedro / Diego" do protótipo.
    await prisma.barber.create({ data: { tenantId, name: 'Rogério Aparecido' } });
    await prisma.service.create({
      data: { tenantId, name: 'Corte navalhado', durationMin: 40, priceCents: 6_000 },
    });

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ownerEmail = `e2e-wa-owner-${run}@barbervp.test`;
    const barberEmail = `e2e-wa-barber-${run}@barbervp.test`;
    const basicoEmail = `e2e-wa-basico-${run}@barbervp.test`;

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dona WA',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });
    await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro WA',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
    });
    await prisma.user.create({
      data: {
        email: basicoEmail,
        name: 'Dono Essencial',
        passwordHash,
        memberships: { create: { tenantId: tenantBasico.id, role: MembershipRole.OWNER } },
      },
    });

    const inativo = await prisma.client.create({
      data: {
        phone: `5511900${run}`,
        name: 'Ausente da Silva',
        notifyWhatsapp: true,
        profiles: {
          create: { tenantId, phone: `5511900${run}`, lastVisitAt: daysAgo(90), createdAt: daysAgo(200) },
        },
      },
      select: { id: true },
    });
    inativoId = inativo.id;

    const recusa = await prisma.client.create({
      data: {
        phone: `5511901${run}`,
        name: 'Recusa Mensagens',
        notifyWhatsapp: false,
        profiles: {
          create: { tenantId, phone: `5511901${run}`, lastVisitAt: daysAgo(90), createdAt: daysAgo(200) },
        },
      },
      select: { id: true },
    });
    recusaId = recusa.id;

    const ativo = await prisma.client.create({
      data: {
        phone: `5511902${run}`,
        name: 'Veio Ontem',
        notifyWhatsapp: true,
        profiles: {
          create: { tenantId, phone: `5511902${run}`, lastVisitAt: daysAgo(1), createdAt: daysAgo(200) },
        },
      },
      select: { id: true },
    });
    ativoId = ativo.id;

    const login = async (email: string) => {
      const response = await api().post(url('/auth/login')).send({ email, password }).expect(200);
      return response.body.accessToken as string;
    };
    ownerToken = await login(ownerEmail);
    barberToken = await login(barberEmail);
    basicoToken = await login(basicoEmail);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slug, slugBasico] } } });
    await prisma.client.deleteMany({ where: { id: { in: [inativoId, recusaId, ativoId] } } });
    await prisma.saasPlan.deleteMany({
      where: { code: { in: [`e2e-wa-avancado-${run}`, `e2e-wa-essencial-${run}`] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Automações ──────────────────────────────────────────────────────────

  it('tenant sem nenhuma linha configurada recebe as 6 automações, na ordem da tela', async () => {
    const semLinhas = await prisma.whatsappAutomationConfig.count({ where: { tenantId } });
    expect(semLinhas).toBe(0);

    const response = await asOwner().get('/whatsapp-config').expect(200);

    expect(response.body.items.map((item: { event: string }) => item.event)).toEqual([
      ...WHATSAPP_EVENT_ORDER,
    ]);
    // Nada foi escrito: a leitura não pode criar linha nenhuma.
    expect(await prisma.whatsappAutomationConfig.count({ where: { tenantId } })).toBe(0);

    const reminder = response.body.items[0];
    expect(reminder.template.length).toBeGreaterThan(5);
    expect(reminder.control).toBe('DELAY_BEFORE');
    expect(reminder.options).toEqual([...WHATSAPP_REMINDER_OPTIONS_MINUTES]);
    expect(response.body.items[3].control).toBe('TIME_OF_DAY');
    expect(response.body.items[4].control).toBe('INACTIVITY_DAYS');
  });

  it('o exemplo da pré-visualização sai de dados reais da barbearia', async () => {
    const response = await asOwner().get('/whatsapp-config').expect(200);

    expect(response.body.sample.barbeiro).toBe('Rogério');
    expect(response.body.sample.servico).toBe('Corte navalhado');
    expect(response.body.sample.link_agendamento).toContain(slug);
  });

  it('o primeiro PATCH cria a linha que ainda não existia (upsert)', async () => {
    const response = await asOwner()
      .patch('/whatsapp-config/REMINDER')
      .send({ enabled: true, offsetMinutes: 180 })
      .expect(200);

    expect(response.body.enabled).toBe(true);
    expect(response.body.offsetMinutes).toBe(180);

    const row = await prisma.whatsappAutomationConfig.findUniqueOrThrow({
      where: { tenantId_event: { tenantId, event: 'REMINDER' } },
    });
    expect(row.offsetMinutes).toBe(180);
    // `enabledAt` é o marco que o gráfico de faltas usa — nasce no primeiro "ligar".
    expect(row.enabledAt).not.toBeNull();
  });

  it('antecedência fora da lista de opções é 400, não entra no banco', async () => {
    await asOwner()
      .patch('/whatsapp-config/REMINDER')
      .send({ offsetMinutes: 7 * 60 })
      .expect(400);

    const row = await prisma.whatsappAutomationConfig.findUniqueOrThrow({
      where: { tenantId_event: { tenantId, event: 'REMINDER' } },
    });
    expect(row.offsetMinutes).toBe(180);
  });

  it('evento inexistente na URL é 400', async () => {
    await asOwner().patch('/whatsapp-config/ANIVERSARIO').send({ enabled: true }).expect(400);
  });

  // ── Gate de plano ───────────────────────────────────────────────────────

  it('Essencial vê os 6 eventos, com os avançados marcados como trancados e desligados', async () => {
    const response = await as(basicoToken).get('/whatsapp-config').expect(200);

    const byEvent = Object.fromEntries(
      response.body.items.map((item: { event: string }) => [item.event, item]),
    );
    expect(byEvent.REMINDER.locked).toBe(false);
    expect(byEvent.BIRTHDAY.locked).toBe(true);
    expect(byEvent.BIRTHDAY.enabled).toBe(false);
    expect(byEvent.REACTIVATION.locked).toBe(true);
    expect(byEvent.REVIEW.locked).toBe(true);
  });

  it('Essencial toma 403 até para EDITAR o template de uma automação avançada', async () => {
    await as(basicoToken)
      .patch('/whatsapp-config/BIRTHDAY')
      .send({ template: 'Parabéns {nome}, tentei editar sem o plano.' })
      .expect(403);
  });

  it('Essencial toma 403 no disparo em massa de reativação', async () => {
    await as(basicoToken).post('/whatsapp-config/reactivation/send').expect(403);
  });

  // ── Papéis ──────────────────────────────────────────────────────────────

  it('BARBER não tem a aba: 403 em todas as rotas', async () => {
    await as(barberToken).get('/whatsapp-config').expect(403);
    await as(barberToken).get('/whatsapp-config/history').expect(403);
    await as(barberToken).get('/whatsapp-config/reactivation').expect(403);
    await as(barberToken).post('/whatsapp-config/reactivation/send').expect(403);
  });

  // ── Conexão ─────────────────────────────────────────────────────────────

  it('a conexão reporta o driver mock em vez de fingir um número pareado', async () => {
    const response = await asOwner().get('/whatsapp-config/connection').expect(200);

    expect(response.body.driver).toBe('MOCK');
    expect(response.body.connected).toBe(false);
    expect(response.body.phone).toBeNull();
  });

  // ── Reativação e histórico ──────────────────────────────────────────────

  it('a faixa de reativação conta pela janela configurada, e o disparo respeita quem recusou', async () => {
    // 60 dias: pega os dois inativos (90 dias) e deixa o de ontem de fora.
    await asOwner()
      .patch('/whatsapp-config/REACTIVATION')
      .send({ offsetMinutes: 60 * 24 * 60 })
      .expect(200);

    const summary = await asOwner().get('/whatsapp-config/reactivation').expect(200);
    expect(summary.body.inactiveDays).toBe(60);
    expect(summary.body.clientCount).toBe(2);
    expect(summary.body.optedOutCount).toBe(1);
    expect(summary.body.locked).toBe(false);
    // O preview já vem com os placeholders resolvidos pelo exemplo da casa.
    expect(summary.body.preview).not.toContain('{link_agendamento}');

    const sent = await asOwner().post('/whatsapp-config/reactivation/send').expect(201);
    expect(sent.body).toEqual({ queued: 1, skipped: 1 });

    const outbox = await prisma.notificationOutbox.findMany({
      where: { tenantId, templateKey: 'whatsapp.reactivation' },
      select: { recipient: true, body: true, status: true },
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.recipient).toBe(`5511900${run}`);
    // `{nome}` foi trocado pelo primeiro nome do destinatário, não pelo exemplo.
    expect(outbox[0]?.body).toContain('Ausente');
    expect(outbox[0]?.body).not.toContain('{nome}');
  });

  it('a janela mais estreita reduz a contagem — a faixa segue o select da automação', async () => {
    await asOwner()
      .patch('/whatsapp-config/REACTIVATION')
      .send({ offsetMinutes: 15 * 24 * 60 })
      .expect(200);

    const summary = await asOwner().get('/whatsapp-config/reactivation').expect(200);
    expect(summary.body.inactiveDays).toBe(15);
    expect(summary.body.clientCount).toBe(2);
  });

  it('o envio reaparece no histórico, com cliente, evento e status resolvidos', async () => {
    const response = await asOwner().get('/whatsapp-config/history').expect(200);

    const row = response.body.items.find(
      (item: { templateKey: string }) => item.templateKey === 'whatsapp.reactivation',
    );
    expect(row).toBeDefined();
    expect(row.event).toBe('REACTIVATION');
    expect(row.clientName).toBe('Ausente da Silva');
    expect(row.delivered).toBe(true);
    expect(row.status).toBe('SENT');
    // Telefone nunca sai inteiro para a tela.
    expect(row.recipient).not.toBe(`5511900${run}`);
    expect(row.recipient).toContain('*');
  });

  /*
   * AUTOMAÇÕES DE CALENDÁRIO — o buraco que o agente 29 fechou.
   *
   * Até aqui o dono ligava BIRTHDAY, REACTIVATION e REVIEW, o `enabled` era
   * gravado, a tela dizia "ativa" — e NADA disparava. O
   * `BookingNotificationsService` só cobre confirmação, lembrete e
   * cancelamento, que são reações a um agendamento; estes três são disparos
   * por calendário e não tinham executor.
   *
   * Os casos abaixo chamam o serviço do job direto: não há rota HTTP para ele
   * (é cron), e testar pelo processor exigiria subir o BullMQ.
   */
  describe('automações de calendário (job diário)', () => {
    let automations: WhatsappAutomationsService;
    let aniversarianteId: string;
    let barberIdLocal: string;
    let serviceIdLocal: string;

    const outboxFor = (event: string, recipient: string) =>
      prisma.notificationOutbox.count({
        where: { tenantId, templateKey: `whatsapp.${event.toLowerCase()}`, recipient },
      });

    beforeAll(async () => {
      automations = app.get(WhatsappAutomationsService);

      const barber = await prisma.barber.findFirstOrThrow({
        where: { tenantId },
        select: { id: true },
      });
      barberIdLocal = barber.id;

      const service = await prisma.service.create({
        data: { tenantId, name: `Corte Auto ${run}`, durationMin: 30, priceCents: 5_000 },
        select: { id: true },
      });
      serviceIdLocal = service.id;

      // Aniversariante DE HOJE — mês e dia de hoje, ano qualquer.
      const hoje = new Date();
      const aniversariante = await prisma.client.create({
        data: {
          phone: `5511903${run}`,
          name: 'Niver Hoje',
          notifyWhatsapp: true,
          birthDate: new Date(Date.UTC(1990, hoje.getMonth(), hoje.getDate())),
          profiles: { create: { tenantId, phone: `5511903${run}`, lastVisitAt: daysAgo(2) } },
        },
        select: { id: true },
      });
      aniversarianteId = aniversariante.id;
    });

    afterAll(async () => {
      await prisma.client.deleteMany({ where: { id: aniversarianteId } });
    });

    /** Desliga as três, para cada caso ligar só a que testa. */
    const desligarTodas = async () => {
      await prisma.whatsappAutomationConfig.updateMany({
        where: { tenantId, event: { in: ['BIRTHDAY', 'REACTIVATION', 'REVIEW'] } },
        data: { enabled: false },
      });
    };

    const ligar = async (event: 'BIRTHDAY' | 'REACTIVATION' | 'REVIEW', offsetMinutes?: number) => {
      await prisma.whatsappAutomationConfig.upsert({
        where: { tenantId_event: { tenantId, event } },
        create: {
          tenantId,
          event,
          enabled: true,
          template: WHATSAPP_DEFAULT_TEMPLATES[event],
          offsetMinutes: offsetMinutes ?? null,
        },
        update: { enabled: true, ...(offsetMinutes === undefined ? {} : { offsetMinutes }) },
      });
    };

    beforeEach(async () => {
      await desligarTodas();
      await prisma.notificationOutbox.deleteMany({ where: { tenantId } });
    });

    it('com TUDO desligado, o job não manda nada — o interruptor é a decisão do dono', async () => {
      const summary = await automations.runOnce();

      expect(summary.birthday).toBe(0);
      expect(summary.reactivation).toBe(0);
      expect(summary.review).toBe(0);
      expect(await prisma.notificationOutbox.count({ where: { tenantId } })).toBe(0);
    });

    it('aniversário: manda para quem faz aniversário HOJE, e só uma vez', async () => {
      await ligar('BIRTHDAY');

      const first = await automations.runOnce();
      expect(first.birthday).toBe(1);
      expect(await outboxFor('BIRTHDAY', `5511903${run}`)).toBe(1);

      // Quem NÃO faz aniversário hoje fica de fora.
      expect(await outboxFor('BIRTHDAY', `5511900${run}`)).toBe(0);

      // Rodar de novo no mesmo dia não duplica — é o ponto mais delicado de um
      // job diário: ninguém quer dois "feliz aniversário".
      const second = await automations.runOnce();
      expect(second.birthday).toBe(0);
      expect(await outboxFor('BIRTHDAY', `5511903${run}`)).toBe(1);
    });

    it('reativação: usa a janela CONFIGURADA, não 30 dias fixos', async () => {
      // 60 dias: o inativo de 90 dias entra.
      await ligar('REACTIVATION', 60 * 1_440);
      const larga = await automations.runOnce();
      expect(larga.reactivation).toBeGreaterThanOrEqual(1);
      expect(await outboxFor('REACTIVATION', `5511900${run}`)).toBe(1);

      // Quem veio ontem não é alvo, e quem recusou WhatsApp também não.
      expect(await outboxFor('REACTIVATION', `5511902${run}`)).toBe(0);
      expect(await outboxFor('REACTIVATION', `5511901${run}`)).toBe(0);

      // E não insiste dentro da mesma janela.
      const denovo = await automations.runOnce();
      expect(denovo.reactivation).toBe(0);

      // Janela de 180 dias: nem o de 90 dias entra mais.
      await prisma.notificationOutbox.deleteMany({ where: { tenantId } });
      await ligar('REACTIVATION', 180 * 1_440);
      const estreita = await automations.runOnce();
      expect(estreita.reactivation).toBe(0);
    });

    it('avaliação: pede depois do atendimento, uma vez por AGENDAMENTO', async () => {
      const endsAt = new Date(Date.now() - 3 * 60 * 60 * 1_000); // concluído há 3h
      const appointment = await prisma.appointment.create({
        data: {
          tenantId,
          bookingCode: `AG-AV${run.slice(-3)}`,
          barberId: barberIdLocal,
          serviceId: serviceIdLocal,
          clientId: inativoId,
          startsAt: new Date(endsAt.getTime() - 30 * 60 * 1_000),
          endsAt,
          status: 'DONE',
          priceCents: 5_000,
        },
        select: { id: true },
      });

      await ligar('REVIEW', 120); // 2h depois
      const first = await automations.runOnce();
      expect(first.review).toBe(1);
      expect(await outboxFor('REVIEW', `5511900${run}`)).toBe(1);

      // Segunda rodada não repete: a chave é o agendamento, não o cliente.
      const second = await automations.runOnce();
      expect(second.review).toBe(0);
      expect(await outboxFor('REVIEW', `5511900${run}`)).toBe(1);

      await prisma.appointment.delete({ where: { id: appointment.id } });
    });

    it('avaliação NÃO varre o histórico inteiro ao ser ligada', async () => {
      // Atendimento de uma semana atrás: ligar a automação hoje não pode
      // disparar pedido para tudo que já foi concluído na vida da barbearia.
      const endsAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
      const antigo = await prisma.appointment.create({
        data: {
          tenantId,
          bookingCode: `AG-AN${run.slice(-3)}`,
          barberId: barberIdLocal,
          serviceId: serviceIdLocal,
          clientId: inativoId,
          startsAt: new Date(endsAt.getTime() - 30 * 60 * 1_000),
          endsAt,
          status: 'DONE',
          priceCents: 5_000,
        },
        select: { id: true },
      });

      await ligar('REVIEW', 120);
      const summary = await automations.runOnce();

      expect(summary.review).toBe(0);

      await prisma.appointment.delete({ where: { id: antigo.id } });
    });

    it('o gate de plano é reconferido no JOB — o downgrade cala a automação', async () => {
      await ligar('BIRTHDAY');

      // O tenant básico tem a MESMA automação ligada, mas está no Essencial.
      const basico = await prisma.tenant.findFirstOrThrow({
        where: { slug: slugBasico },
        select: { id: true },
      });
      await prisma.whatsappAutomationConfig.upsert({
        where: { tenantId_event: { tenantId: basico.id, event: 'BIRTHDAY' } },
        create: {
          tenantId: basico.id,
          event: 'BIRTHDAY',
          enabled: true,
          template: WHATSAPP_DEFAULT_TEMPLATES.BIRTHDAY,
        },
        update: { enabled: true },
      });

      await automations.runOnce();

      // O avançado recebeu; o essencial, não. `enabled` sobrevive a um
      // downgrade, e sem esta checagem o job entregaria um recurso que a
      // barbearia deixou de pagar.
      expect(await outboxFor('BIRTHDAY', `5511903${run}`)).toBe(1);
      expect(
        await prisma.notificationOutbox.count({ where: { tenantId: basico.id } }),
      ).toBe(0);
    });
  });

  it('o histórico pagina por cursor e não mistura barbearias', async () => {
    const first = await asOwner().get('/whatsapp-config/history?limit=1').expect(200);
    expect(first.body.items).toHaveLength(1);

    const vazio = await as(basicoToken).get('/whatsapp-config/history').expect(200);
    expect(vazio.body.items).toEqual([]);
    expect(vazio.body.nextCursor).toBeNull();
  });
});
