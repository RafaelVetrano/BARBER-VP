import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { MembershipRole, PrismaClient, SubscriptionStatus, TenantStatus } from '@prisma/client';
import { ACCOUNT_DELETION_CONFIRM_WORD, PlanTier, featuresForTier } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';
import { MaintenanceService } from '../src/queue/jobs/maintenance.service';

/**
 * Tela **Meu perfil** (agente 27) de ponta a ponta.
 *
 * O que estes casos protegem, em ordem de importância:
 *  1. **excluir a conta é do DONO** — gerente e barbeiro tomam 403. É a ação
 *     mais destrutiva do produto inteiro: apaga barbearia, equipe, agenda e
 *     histórico de clientes;
 *  2. **excluir NÃO apaga na hora** — agenda a faxina, cancela a assinatura e
 *     deixa o dono entrar e desistir dentro da janela. Um `delete` imediato
 *     transformaria o "30 dias para reativar" do modal em mentira;
 *  3. **o barbeiro não muda o próprio nome** — a ficha dele é da Equipe, e
 *     renomeá-la por aqui trocaria o dono da agenda e da comissão pelas costas
 *     do gerente. O `canEditName` da tela é só o espelho deste 403;
 *  4. **a foto não é do barbeiro** — mesmo motivo, e o desenho do funcionário
 *     nem tem o "Alterar foto";
 *  5. **a exportação LGPD é da própria pessoa** — e o e-mail continua único.
 */
describe('tela Meu perfil — dados, foto, LGPD e exclusão de conta (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-perfil-${run}`;
  const password = 'PerfilSenhaForte1!';
  const ownerEmail = `e2e-perfil-owner-${run}@barbervp.test`;
  const managerEmail = `e2e-perfil-manager-${run}@barbervp.test`;
  const barberEmail = `e2e-perfil-barber-${run}@barbervp.test`;
  const planCode = `e2e-perfil-plan-${run}`;

  let tenantId: string;
  let ownerId: string;
  let barberUserId: string;
  let barberId: string;
  let ownerToken: string;
  let managerToken: string;
  let barberToken: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${token}`),
    delete: (path: string) => api().delete(url(path)).set('Authorization', `Bearer ${token}`),
  });
  const asOwner = () => as(ownerToken);
  const asManager = () => as(managerToken);
  const asBarber = () => as(barberToken);

  const login = async (email: string): Promise<string> => {
    const response = await api().post(url('/auth/login')).send({ email, password }).expect(200);
    return response.body.accessToken as string;
  };

  /** Desfaz o agendamento de exclusão direto no banco, entre casos. */
  const clearScheduledDeletion = () =>
    prisma.tenant.update({
      where: { id: tenantId },
      data: { purgeAt: null, status: TenantStatus.ACTIVE },
    });

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

    const plan = await prisma.saasPlan.create({
      data: {
        code: planCode,
        name: 'Avançado (e2e perfil)',
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
        name: 'Barbearia Perfil (e2e)',
        planId: plan.id,
        status: TenantStatus.ACTIVE,
        settings: { create: {} },
        subscriptions: {
          create: {
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3_600_000),
          },
        },
      },
      select: { id: true },
    });
    tenantId = tenant.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'Dona Perfil',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
      select: { id: true },
    });
    ownerId = owner.id;

    await prisma.user.create({
      data: {
        email: managerEmail,
        name: 'Gerente Perfil',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.MANAGER } },
      },
    });

    const barberUser = await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro Perfil',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
      select: { id: true },
    });
    barberUserId = barberUser.id;

    const barber = await prisma.barber.create({
      data: { tenantId, userId: barberUser.id, name: 'Barbeiro Perfil', email: barberEmail },
      select: { id: true },
    });
    barberId = barber.id;

    ownerToken = await login(ownerEmail);
    managerToken = await login(managerEmail);
    barberToken = await login(barberEmail);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${run}@barbervp.test` } } });
    await prisma.saasPlan.deleteMany({ where: { code: planCode } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Leitura ─────────────────────────────────────────────────────────────

  describe('GET /me — o recorte por papel', () => {
    it('dono: edita tudo e pode excluir a conta', async () => {
      const response = await asOwner().get('/me').expect(200);

      expect(response.body).toMatchObject({
        email: ownerEmail,
        role: MembershipRole.OWNER,
        roleLabel: 'Proprietário',
        tenantName: 'Barbearia Perfil (e2e)',
        canEditName: true,
        canUploadAvatar: true,
        canDeleteAccount: true,
        scheduledDeletion: null,
      });
    });

    it('gerente: administra a barbearia, mas não a exclui', async () => {
      const response = await asManager().get('/me').expect(200);

      expect(response.body).toMatchObject({
        role: MembershipRole.MANAGER,
        roleLabel: 'Gerente',
        canEditName: true,
        canUploadAvatar: true,
        canDeleteAccount: false,
      });
    });

    it('barbeiro: o WhatsApp cai para a ficha da Equipe quando o login não tem', async () => {
      // Quem entra pelo convite da Equipe não tem `User.phone`; o número vive
      // em `Barber.phone`. Sem a queda, o profissional abriria a tela com o
      // campo vazio enquanto a aba Equipe mostra o número dele.
      await prisma.user.update({ where: { id: barberUserId }, data: { phone: null } });
      await prisma.barber.update({ where: { id: barberId }, data: { phone: '5516977770033' } });

      const response = await asBarber().get('/me').expect(200);
      expect(response.body.phone).toBe('5516977770033');

      await prisma.barber.update({ where: { id: barberId }, data: { phone: null } });
    });

    it('barbeiro: nome e foto são da administração', async () => {
      const response = await asBarber().get('/me').expect(200);

      expect(response.body).toMatchObject({
        role: MembershipRole.BARBER,
        roleLabel: 'Barbeiro',
        canEditName: false,
        canUploadAvatar: false,
        canDeleteAccount: false,
      });
    });
  });

  // ── Dados pessoais ──────────────────────────────────────────────────────

  describe('PATCH /me', () => {
    it('normaliza o WhatsApp e devolve o perfil já resolvido', async () => {
      const response = await asOwner()
        .patch('/me')
        .send({ name: 'Dona Perfil Silva', phone: '(16) 99999-0011' })
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Dona Perfil Silva',
        // E.164 sem formatação — a máscara é da tela, o banco guarda cru.
        phone: '5516999990011',
      });
    });

    it('recusa telefone que não é telefone', async () => {
      await asOwner().patch('/me').send({ phone: '123' }).expect(400);
    });

    it('recusa e-mail já usado por outro login', async () => {
      const response = await asOwner().patch('/me').send({ email: managerEmail }).expect(409);
      expect(response.body.code).toBe('EMAIL_IN_USE');
    });

    it('o contato do barbeiro desce para a ficha dele na Equipe', async () => {
      await asBarber().patch('/me').send({ phone: '(16) 98888-0022' }).expect(200);

      const barber = await prisma.barber.findUniqueOrThrow({
        where: { id: barberId },
        select: { phone: true },
      });
      // É `Barber.phone` que o WhatsApp da barbearia usa para falar com o
      // profissional: gravar só em `User` deixaria a tela e o envio divergindo.
      expect(barber.phone).toBe('5516988880022');
    });

    it('o barbeiro NÃO renomeia a si mesmo — 403, não silêncio', async () => {
      await asBarber().patch('/me').send({ name: 'Outro Nome' }).expect(403);

      const barber = await prisma.barber.findUniqueOrThrow({
        where: { id: barberId },
        select: { name: true },
      });
      expect(barber.name).toBe('Barbeiro Perfil');
    });

    it('reenviar o MESMO nome não é uma edição — o barbeiro salva o resto', async () => {
      // A tela do funcionário mostra o nome travado; se ela mandar o campo de
      // volta sem mudança, salvar e-mail/telefone não pode virar 403.
      await asBarber().patch('/me').send({ name: 'Barbeiro Perfil', phone: '' }).expect(200);

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: barberUserId },
        select: { phone: true },
      });
      expect(user.phone).toBeNull();
    });
  });

  // ── Foto ────────────────────────────────────────────────────────────────

  describe('POST /me/avatar', () => {
    // 1×1 PNG — o menor arquivo válido que o `StorageAdapter` aceita.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    it('grava a foto do dono e devolve a URL', async () => {
      const response = await api()
        .post(url('/me/avatar'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', png, { filename: 'foto.png', contentType: 'image/png' })
        .expect(201);

      expect(response.body.avatarUrl).toContain('/uploads/');

      // A sessão também precisa enxergar: é de `/auth/me` que o menu do avatar
      // da topbar lê a foto.
      const me = await asOwner().get('/auth/me').expect(200);
      expect(me.body.avatarUrl).toBe(response.body.avatarUrl);
    });

    it('remove a foto', async () => {
      const response = await asOwner().delete('/me/avatar').expect(200);
      expect(response.body.avatarUrl).toBeNull();
    });

    it('recusa PDF disfarçado de imagem', async () => {
      await api()
        .post(url('/me/avatar'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', Buffer.from('%PDF-1.7'), { filename: 'x.pdf', contentType: 'application/pdf' })
        .expect(415);
    });

    it('o barbeiro não troca a própria foto — 403', async () => {
      await api()
        .post(url('/me/avatar'))
        .set('Authorization', `Bearer ${barberToken}`)
        .attach('file', png, { filename: 'foto.png', contentType: 'image/png' })
        .expect(403);
    });
  });

  // ── LGPD ────────────────────────────────────────────────────────────────

  describe('GET /me/export', () => {
    it('exporta os dados da própria pessoa, com vínculos e ficha de barbeiro', async () => {
      const response = await asBarber().get('/me/export').expect(200);

      expect(response.body.profile.email).toBe(barberEmail);
      expect(response.body.memberships).toEqual([
        expect.objectContaining({ tenantSlug: slug, role: MembershipRole.BARBER }),
      ]);
      expect(response.body.barberProfiles).toEqual([
        expect.objectContaining({ name: 'Barbeiro Perfil' }),
      ]);
      // Sessão aberta entra, mas SEM o token — exportação não é vazamento.
      expect(JSON.stringify(response.body)).not.toContain('refreshHash');
    });

    it('grava a trilha de auditoria da exportação', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'user.data_exported', actorUserId: barberUserId },
      });
      expect(entry).not.toBeNull();
    });
  });

  describe('POST /me/data-deletion-request', () => {
    it('barbeiro: o pedido chega ao dono por e-mail', async () => {
      await asBarber().post('/me/data-deletion-request').expect(202);

      const mail = await prisma.mailOutbox.findFirst({
        where: { tenantId, to: ownerEmail },
        orderBy: { createdAt: 'desc' },
      });
      expect(mail?.subject).toContain('Pedido de exclusão de dados');
    });

    it('dono: não pede a si mesmo — tem o botão de excluir a conta', async () => {
      await asOwner().post('/me/data-deletion-request').expect(400);
    });
  });

  // ── Exclusão da conta ───────────────────────────────────────────────────

  describe('POST /me/account-deletion', () => {
    afterEach(async () => {
      await clearScheduledDeletion();
    });

    it('gerente e barbeiro tomam 403 — a barbearia não é deles', async () => {
      await asManager()
        .post('/me/account-deletion')
        .send({ confirm: ACCOUNT_DELETION_CONFIRM_WORD })
        .expect(403);
      await asBarber()
        .post('/me/account-deletion')
        .send({ confirm: ACCOUNT_DELETION_CONFIRM_WORD })
        .expect(403);

      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { purgeAt: true },
      });
      expect(tenant.purgeAt).toBeNull();
    });

    it('sem a palavra por extenso, não exclui', async () => {
      await asOwner().post('/me/account-deletion').send({ confirm: 'excluir' }).expect(400);
      await asOwner().post('/me/account-deletion').send({ confirm: '' }).expect(400);
    });

    it('agenda a faxina, cancela a assinatura e NÃO apaga nada agora', async () => {
      const response = await asOwner()
        .post('/me/account-deletion')
        .send({ confirm: ACCOUNT_DELETION_CONFIRM_WORD })
        .expect(201);

      expect(response.body.scheduledDeletion.daysLeft).toBe(30);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'account.deletion_requested', tenantId, actorUserId: ownerId },
      });
      expect(entry).not.toBeNull();

      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { status: true, purgeAt: true, deletedAt: true },
      });
      expect(tenant.status).toBe(TenantStatus.CANCELED);
      expect(tenant.purgeAt).not.toBeNull();
      // `deletedAt` continua nulo DE PROPÓSITO: é ele que o login e o
      // `TenantGuard` filtram, e marcá-lo aqui trancaria o dono para fora da
      // janela em que ele deveria poder desistir.
      expect(tenant.deletedAt).toBeNull();

      const subscription = await prisma.tenantSubscription.findFirstOrThrow({ where: { tenantId } });
      expect(subscription.status).toBe(SubscriptionStatus.CANCELED);

      // E o dono continua entrando.
      await asOwner().get('/me').expect(200);
    });

    it('não agenda duas vezes', async () => {
      await asOwner()
        .post('/me/account-deletion')
        .send({ confirm: ACCOUNT_DELETION_CONFIRM_WORD })
        .expect(201);
      const again = await asOwner()
        .post('/me/account-deletion')
        .send({ confirm: ACCOUNT_DELETION_CONFIRM_WORD })
        .expect(409);
      expect(again.body.code).toBe('DELETION_ALREADY_SCHEDULED');
    });

    it('o dono desiste dentro da janela', async () => {
      await asOwner()
        .post('/me/account-deletion')
        .send({ confirm: ACCOUNT_DELETION_CONFIRM_WORD })
        .expect(201);

      const response = await asOwner().delete('/me/account-deletion').expect(200);
      expect(response.body.scheduledDeletion).toBeNull();

      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { status: true, purgeAt: true },
      });
      expect(tenant.purgeAt).toBeNull();
      // Volta a TRIAL, não a ACTIVE: a assinatura foi cancelada no gateway e
      // não se ressuscita cobrança recorrente por conta própria.
      expect(tenant.status).toBe(TenantStatus.TRIAL);
    });

    it('sem exclusão agendada, desistir é 409', async () => {
      const response = await asOwner().delete('/me/account-deletion').expect(409);
      expect(response.body.code).toBe('DELETION_NOT_SCHEDULED');
    });
  });

  // ── A faxina cumpre o prazo ─────────────────────────────────────────────

  describe('MaintenanceService — a exclusão vencida é cumprida', () => {
    it('apaga a barbearia depois do prazo e não antes', async () => {
      const doomedSlug = `${slug}-doomed`;
      const doomed = await prisma.tenant.create({
        data: {
          slug: doomedSlug,
          name: 'Barbearia Condenada (e2e)',
          status: TenantStatus.CANCELED,
          purgeAt: new Date(Date.now() + 5 * 24 * 3_600_000),
          settings: { create: {} },
        },
        select: { id: true },
      });

      const maintenance = app.get(MaintenanceService);

      // Dentro da janela: nada acontece.
      await maintenance.runOnce();
      expect(await prisma.tenant.findUnique({ where: { id: doomed.id } })).not.toBeNull();

      // Vencida: some, e o `AuditLog` fica como prova (tenantId é SetNull).
      await prisma.tenant.update({
        where: { id: doomed.id },
        data: { purgeAt: new Date(Date.now() - 1_000) },
      });
      const summary = await maintenance.runOnce();

      expect(summary.purgedTenants).toBeGreaterThanOrEqual(1);
      expect(await prisma.tenant.findUnique({ where: { id: doomed.id } })).toBeNull();
      expect(
        await prisma.auditLog.findFirst({
          where: { action: 'account.purged', entityId: doomed.id },
        }),
      ).not.toBeNull();
    });
  });
});
