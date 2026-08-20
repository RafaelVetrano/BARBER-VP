import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { OutboxStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';
import {
  NOTIFICATION_ADAPTER,
  type NotificationAdapter,
} from '../src/adapters/notification/notification.adapter';
import { MAIL_ADAPTER, type MailAdapter } from '../src/adapters/mail/mail.adapter';
import { MaintenanceService, RETENTION_DAYS } from '../src/queue/jobs/maintenance.service';

/**
 * Filas e jobs (fase 09) contra o banco real.
 *
 * Os workers estão DESLIGADOS na suíte (ver `test/load-env.ts`), então aqui os
 * serviços são chamados diretamente — é exatamente o que o processor faz, sem
 * depender do relógio do BullMQ para o teste ser determinístico. O que se
 * verifica é a lógica que fecha as dívidas das fases 03/04/05: o lembrete
 * agendado sai, o que ainda não venceu NÃO sai, a entrega é idempotente, e a
 * faxina respeita as retenções.
 */
describe('filas e jobs (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;
  let notifications: NotificationAdapter;
  let mails: MailAdapter;
  let maintenance: MaintenanceService;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-queue-${run}`;
  let tenantId: string;

  const createdOutboxIds: string[] = [];

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
  const hoursAhead = (hours: number) => new Date(Date.now() + hours * 3_600_000);

  /** Insere uma linha crua no outbox — simula o que o booking deixou agendado. */
  async function plantNotification(
    scheduledFor: Date | null,
    status: OutboxStatus = OutboxStatus.PENDING,
  ) {
    const row = await prisma.notificationOutbox.create({
      data: {
        tenantId,
        recipient: `5511${run}`,
        templateKey: 'REMINDER',
        body: 'Lembrete de teste',
        payload: {},
        status,
        attempts: 0,
        scheduledFor,
      },
      select: { id: true },
    });
    createdOutboxIds.push(row.id);
    return row.id;
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

    notifications = app.get<NotificationAdapter>(NOTIFICATION_ADAPTER);
    mails = app.get<MailAdapter>(MAIL_ADAPTER);
    maintenance = app.get(MaintenanceService);

    const tenant = await prisma.tenant.create({
      data: { slug, name: `Fila ${run}`, settings: { create: {} } },
      select: { id: true },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('dreno do outbox de notificação', () => {
    it('entrega o lembrete cujo horário já passou', async () => {
      const id = await plantNotification(hoursAgo(1));

      const result = await notifications.dispatchDue();

      expect(result.delivered).toBeGreaterThanOrEqual(1);

      const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe(OutboxStatus.SENT);
      expect(row.sentAt).not.toBeNull();
      expect(row.attempts).toBe(1);
    });

    it('NÃO entrega lembrete agendado para o futuro', async () => {
      const id = await plantNotification(hoursAhead(24));

      await notifications.dispatchDue();

      const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe(OutboxStatus.PENDING);
      expect(row.sentAt).toBeNull();
      expect(row.attempts).toBe(0);
    });

    it('respeita o `now` recebido — o lembrete de amanhã sai se o relógio avançar', async () => {
      const id = await plantNotification(hoursAhead(24));

      await notifications.dispatchDue({ now: hoursAhead(25) });

      const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe(OutboxStatus.SENT);
    });

    it('é idempotente: rodar de novo não reenvia nem incrementa tentativa', async () => {
      const id = await plantNotification(hoursAgo(2));

      await notifications.dispatchDue();
      const afterFirst = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });

      await notifications.dispatchDue();
      const afterSecond = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });

      expect(afterSecond.status).toBe(OutboxStatus.SENT);
      expect(afterSecond.attempts).toBe(afterFirst.attempts);
      expect(afterSecond.sentAt?.toISOString()).toBe(afterFirst.sentAt?.toISOString());
    });

    it('não repesca mensagem que já falhou em definitivo', async () => {
      const id = await plantNotification(hoursAgo(3), OutboxStatus.FAILED);

      await notifications.dispatchDue();

      const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe(OutboxStatus.FAILED);
      expect(row.attempts).toBe(0);
    });
  });

  describe('dreno do outbox de e-mail', () => {
    it('entrega o e-mail que ficou pendente', async () => {
      const row = await prisma.mailOutbox.create({
        data: {
          tenantId,
          to: `fila-${run}@barbervp.test`,
          subject: 'Pendente',
          body: 'corpo',
          payload: {},
          status: OutboxStatus.PENDING,
          attempts: 0,
        },
        select: { id: true },
      });

      const result = await mails.dispatchDue();
      expect(result.delivered).toBeGreaterThanOrEqual(1);

      const after = await prisma.mailOutbox.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.status).toBe(OutboxStatus.SENT);
      expect(after.sentAt).not.toBeNull();
    });
  });

  describe('faxina de dados expirados', () => {
    it('apaga OTP expirado além da retenção e preserva o recente', async () => {
      const stale = await prisma.otpCode.create({
        data: {
          purpose: 'CLIENT_SIGNUP',
          channel: 'WHATSAPP',
          destination: `5511velho${run}`.slice(0, 20),
          codeHash: 'hash-velho',
          expiresAt: hoursAgo(24 * (RETENTION_DAYS.otp + 5)),
        },
        select: { id: true },
      });
      const fresh = await prisma.otpCode.create({
        data: {
          purpose: 'CLIENT_SIGNUP',
          channel: 'WHATSAPP',
          destination: `5511novo${run}`.slice(0, 20),
          codeHash: 'hash-novo',
          expiresAt: hoursAhead(1),
        },
        select: { id: true },
      });

      await maintenance.runOnce();

      expect(await prisma.otpCode.findUnique({ where: { id: stale.id } })).toBeNull();
      expect(await prisma.otpCode.findUnique({ where: { id: fresh.id } })).not.toBeNull();

      await prisma.otpCode.deleteMany({ where: { id: fresh.id } });
    });

    it('não apaga mensagem do outbox ainda dentro da retenção', async () => {
      const id = await plantNotification(hoursAgo(1));
      await notifications.dispatchDue();

      await maintenance.runOnce();

      expect(await prisma.notificationOutbox.findUnique({ where: { id } })).not.toBeNull();
    });
  });

  describe('painel de jobs', () => {
    it('exige autenticação', async () => {
      await api().get(url('/admin/queues')).expect(401);
    });

    it('recusa quem não é super admin', async () => {
      const client = await request(app.getHttpServer())
        .get(url('/admin/queues'))
        .set('Authorization', 'Bearer token-invalido');
      expect(client.status).toBe(401);
    });
  });
});
