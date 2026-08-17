import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { REFRESH_COOKIE } from '@barbervp/types';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Fluxos de autenticação de ponta a ponta, contra o banco real.
 *
 * O código OTP é lido do `NotificationOutbox` — a mesma fila que o driver mock
 * grava e que um dev consultaria em desenvolvimento. Nenhum atalho de teste
 * (nenhuma env de debug que devolva o código na resposta) foi criado para isto:
 * o teste passa exatamente pelo caminho do usuário.
 */
describe('auth (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  /** Sufixo por execução — a suíte roda no mesmo banco do seed sem sujá-lo. */
  const run = Date.now().toString().slice(-6);
  const ownerEmail = `e2e-owner-${run}@barbervp.test`;
  const ownerPassword = 'SenhaForte2026';
  // Celular válido e único por execução: DDD 16 + 9 + 8 dígitos.
  const clientDigits = `${run}00`;
  const clientPhone = `(16) 9 ${clientDigits.slice(0, 4)}-${clientDigits.slice(4)}`;
  const clientEmail = `e2e-cliente-${run}@barbervp.test`;
  const clientPassword = 'ClienteSenha1';

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  /** Lê o código de 6 dígitos da última mensagem enviada ao destino. */
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

  const cookieFrom = (response: request.Response, name: string): string => {
    const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = (raw ?? []).find((entry) => entry.startsWith(`${name}=`));
    if (!cookie) {
      throw new Error(`Cookie ${name} não veio na resposta`);
    }
    return cookie.split(';')[0]!;
  };

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
    const user = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
    if (user) {
      await prisma.tenant.deleteMany({ where: { memberships: { some: { userId: user.id } } } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.client.deleteMany({ where: { email: clientEmail } });
    await prisma.otpCode.deleteMany({ where: { destination: { contains: run } } });

    await app.close();
    await prisma.$disconnect();
  });

  // ── Estabelecimento ───────────────────────────────────────────────────────

  describe('estabelecimento', () => {
    let accessToken: string;
    let refreshCookie: string;
    let tenantId: string;

    it('recusa senha fora da regra do protótipo (8+, letra e número)', async () => {
      const response = await api()
        .post(url('/auth/register'))
        .send({
          name: 'Fulano de Tal',
          phone: '(16) 9 9111-2233',
          email: `fraca-${run}@barbervp.test`,
          password: 'abcdefgh',
          shopName: 'Barbearia Teste',
          acceptTerms: true,
        })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('cria User + Tenant (TRIAL) + Membership OWNER em uma transação', async () => {
      const response = await api()
        .post(url('/auth/register'))
        .send({
          name: 'Ana Paula Souza',
          phone: '(16) 9 9111-2233',
          email: ownerEmail,
          password: ownerPassword,
          shopName: `Studio E2E ${run}`,
          acceptTerms: true,
        })
        .expect(201);

      expect(response.body.user.email).toBe(ownerEmail);
      expect(response.body.memberships).toHaveLength(1);
      expect(response.body.memberships[0].role).toBe('OWNER');
      expect(response.body.memberships[0].tenantStatus).toBe('TRIAL');
      expect(response.body.activeTenantId).toBe(response.body.memberships[0].tenantId);

      tenantId = response.body.activeTenantId;
      refreshCookie = cookieFrom(response, REFRESH_COOKIE.ESTABLISHMENT);

      // O dono já entra como profissional (linha "Você" do passo 5).
      const barbers = await prisma.barber.findMany({ where: { tenantId } });
      expect(barbers).toHaveLength(1);
      expect(barbers[0]!.userId).not.toBeNull();

      // Horário padrão e settings nascem junto — o wizard abre preenchido.
      expect(await prisma.tenantBusinessHour.count({ where: { tenantId } })).toBe(7);
      expect(await prisma.tenantSettings.count({ where: { tenantId } })).toBe(1);
    });

    it('deriva um slug único a partir do nome da barbearia', async () => {
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(tenant.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(tenant.slug).toContain('studio-e2e');
    });

    it('recusa o mesmo e-mail num segundo cadastro', async () => {
      const response = await api()
        .post(url('/auth/register'))
        .send({
          name: 'Outro Alguém',
          phone: '(16) 9 9444-5566',
          email: ownerEmail,
          password: ownerPassword,
          shopName: 'Outra Barbearia',
          acceptTerms: true,
        })
        .expect(409);

      expect(response.body.code).toBe('EMAIL_IN_USE');
      expect(response.body.message).toContain('Já existe um cadastro com este e-mail');
    });

    it('check-email distingue os três estados da tela de cadastro', async () => {
      const ocupado = await api()
        .post(url('/auth/check-email'))
        .send({ email: ownerEmail })
        .expect(200);
      expect(ocupado.body.status).toBe('establishment');

      const livre = await api()
        .post(url('/auth/check-email'))
        .send({ email: `livre-${run}@barbervp.test` })
        .expect(200);
      expect(livre.body.status).toBe('available');
    });

    it('faz login e devolve access token com o tenant ativo', async () => {
      const response = await api()
        .post(url('/auth/login'))
        .send({ email: ownerEmail, password: ownerPassword })
        .expect(200);

      expect(response.body.expiresIn).toBe(900);
      expect(response.body.activeTenantId).toBe(tenantId);
      accessToken = response.body.accessToken;
      refreshCookie = cookieFrom(response, REFRESH_COOKIE.ESTABLISHMENT);
    });

    it('responde 401 genérico para senha errada — sem revelar se a conta existe', async () => {
      const senhaErrada = await api()
        .post(url('/auth/login'))
        .send({ email: ownerEmail, password: 'SenhaErrada123' })
        .expect(401);

      const contaInexistente = await api()
        .post(url('/auth/login'))
        .send({ email: `naoexiste-${run}@barbervp.test`, password: 'SenhaErrada123' })
        .expect(401);

      expect(senhaErrada.body).toEqual(contaInexistente.body);
      expect(senhaErrada.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('grava o refresh em cookie httpOnly escopado na rota de auth', async () => {
      const response = await api()
        .post(url('/auth/login'))
        .send({ email: ownerEmail, password: ownerPassword })
        .expect(200);

      const raw = response.headers['set-cookie'] as unknown as string[];
      const cookie = raw.find((entry) => entry.startsWith(`${REFRESH_COOKIE.ESTABLISHMENT}=`))!;

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain(`Path=/${prefix}/auth`);
      expect(cookie).toContain('SameSite=Lax');
      // O access token NÃO vai em cookie — vive em memória no cliente.
      expect(raw.some((entry) => entry.includes(response.body.accessToken))).toBe(false);
    });

    it('rotaciona o par no refresh e revoga a família se o token antigo voltar', async () => {
      const first = await api()
        .post(url('/auth/refresh'))
        .set('Cookie', refreshCookie)
        .expect(200);

      const rotated = cookieFrom(first, REFRESH_COOKIE.ESTABLISHMENT);
      expect(rotated).not.toBe(refreshCookie);

      // Reuso do token já rotacionado: sinal clássico de vazamento.
      await api().post(url('/auth/refresh')).set('Cookie', refreshCookie).expect(401);

      // E a família inteira cai junto — inclusive o token legítimo.
      await api().post(url('/auth/refresh')).set('Cookie', rotated).expect(401);
    });

    it('logout invalida o access token na hora, sem esperar os 15 minutos', async () => {
      const login = await api()
        .post(url('/auth/login'))
        .send({ email: ownerEmail, password: ownerPassword })
        .expect(200);

      const token = login.body.accessToken as string;
      await api().get(url('/auth/me')).set('Authorization', `Bearer ${token}`).expect(200);

      await api()
        .post(url('/auth/logout'))
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', cookieFrom(login, REFRESH_COOKIE.ESTABLISHMENT))
        .expect(204);

      await api().get(url('/auth/me')).set('Authorization', `Bearer ${token}`).expect(401);
    });

    it('troca de senha e derruba as demais sessões', async () => {
      const sessionA = await api()
        .post(url('/auth/login'))
        .send({ email: ownerEmail, password: ownerPassword })
        .expect(200);
      const sessionB = await api()
        .post(url('/auth/login'))
        .send({ email: ownerEmail, password: ownerPassword })
        .expect(200);

      await api()
        .post(url('/auth/password/change'))
        .set('Authorization', `Bearer ${sessionB.body.accessToken}`)
        .send({ currentPassword: ownerPassword, newPassword: 'NovaSenha2026' })
        .expect(204);

      // A sessão que trocou continua viva; a outra, não.
      await api()
        .get(url('/auth/me'))
        .set('Authorization', `Bearer ${sessionB.body.accessToken}`)
        .expect(200);
      await api()
        .get(url('/auth/me'))
        .set('Authorization', `Bearer ${sessionA.body.accessToken}`)
        .expect(401);

      await api()
        .post(url('/auth/login'))
        .send({ email: ownerEmail, password: 'NovaSenha2026' })
        .expect(200);
      accessToken = sessionB.body.accessToken;
    });

    it('recuperação por e-mail responde igual exista ou não a conta', async () => {
      const existente = await api()
        .post(url('/auth/password/forgot'))
        .send({ email: ownerEmail })
        .expect(202);
      const inexistente = await api()
        .post(url('/auth/password/forgot'))
        .send({ email: `fantasma-${run}@barbervp.test` })
        .expect(202);

      expect(existente.body).toEqual(inexistente.body);

      // Só a conta real gerou e-mail na fila.
      const mails = await prisma.mailOutbox.count({ where: { to: ownerEmail } });
      expect(mails).toBeGreaterThan(0);
      expect(await prisma.mailOutbox.count({ where: { to: `fantasma-${run}@barbervp.test` } })).toBe(0);
    });

    it('registra login, criação de tenant e troca de senha no AuditLog', async () => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: ownerEmail },
        select: { id: true },
      });
      const actions = await prisma.auditLog.findMany({
        where: { actorUserId: user.id },
        select: { action: true },
      });
      const unique = new Set(actions.map((entry) => entry.action));

      expect(unique).toContain('auth.login');
      expect(unique).toContain('tenant.created');
      expect(unique).toContain('auth.password_changed');
      expect(unique).toContain('auth.password_reset_requested');
    });

    it('exige autenticação nas rotas do painel', async () => {
      expect(accessToken).toBeDefined();
      await api().get(url('/auth/me')).expect(401);
      await api().get(url('/onboarding')).expect(401);
    });
  });

  // ── Cliente ───────────────────────────────────────────────────────────────

  describe('cliente', () => {
    let challengeId: string;
    let normalizedPhone: string;

    it('não cria a conta antes do OTP — só abre o desafio', async () => {
      const response = await api()
        .post(url('/client-auth/register'))
        .send({
          firstName: 'João',
          lastName: 'Pedro',
          phone: clientPhone,
          email: clientEmail,
          confirmEmail: clientEmail,
          password: clientPassword,
          confirmPassword: clientPassword,
          acceptTerms: true,
          marketingOptIn: true,
        })
        .expect(202);

      expect(response.body.challengeId).toEqual(expect.any(String));
      expect(response.body.resendInSeconds).toBe(59);
      expect(response.body.destinationMasked).toMatch(/\*\*\*\*/);
      challengeId = response.body.challengeId;

      // A conta ainda não existe: ocupar o telefone de outra pessoa sem provar
      // a posse dele seria um vetor de bloqueio de conta alheia.
      expect(await prisma.client.count({ where: { email: clientEmail } })).toBe(0);

      const challenge = await prisma.otpCode.findUniqueOrThrow({ where: { id: challengeId } });
      normalizedPhone = challenge.destination;
      expect(normalizedPhone).toMatch(/^55\d{11}$/);
    });

    it('recusa e-mail de confirmação divergente', async () => {
      await api()
        .post(url('/client-auth/register'))
        .send({
          firstName: 'Maria',
          lastName: 'Fernanda',
          phone: '(16) 9 9777-1111',
          email: `outro-${run}@barbervp.test`,
          confirmEmail: `diferente-${run}@barbervp.test`,
          password: clientPassword,
          confirmPassword: clientPassword,
          acceptTerms: true,
        })
        .expect(400);
    });

    it('nunca guarda o código em claro no banco', async () => {
      const code = await lastOtpFor(normalizedPhone);
      const challenge = await prisma.otpCode.findUniqueOrThrow({ where: { id: challengeId } });

      expect(challenge.codeHash).not.toBe(code);
      expect(challenge.codeHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('conta as tentativas erradas e devolve quantas restam', async () => {
      const response = await api()
        .post(url('/client-auth/otp/verify'))
        .send({ challengeId, code: '000000' })
        .expect(400);

      expect(response.body.code).toBe('OTP_INVALID');
      expect(response.body.details.attemptsLeft).toBe(4);
    });

    it('respeita o cooldown de 59 segundos no reenvio', async () => {
      const response = await api()
        .post(url('/client-auth/otp/resend'))
        .send({ challengeId })
        .expect(429);

      expect(response.body.code).toBe('OTP_COOLDOWN');
      expect(response.body.details.retryInSeconds).toBeGreaterThan(0);
    });

    it('cria a conta verificada e emite a sessão quando o código confere', async () => {
      const code = await lastOtpFor(normalizedPhone);

      const response = await api()
        .post(url('/client-auth/otp/verify'))
        .send({ challengeId, code })
        .expect(200);

      expect(response.body.kind).toBe('session');
      expect(response.body.session.client.phoneVerified).toBe(true);
      expect(response.body.session.client.name).toBe('João Pedro');
      expect(response.body.session.client.marketingOptIn).toBe(true);

      const client = await prisma.client.findUniqueOrThrow({ where: { phone: normalizedPhone } });
      expect(client.phoneVerifiedAt).not.toBeNull();
      // LGPD: o aceite dos termos fica datado.
      expect(client.consentAt).not.toBeNull();

      const cookie = cookieFrom(response, REFRESH_COOKIE.CLIENT);
      expect(cookie.startsWith(`${REFRESH_COOKIE.CLIENT}=`)).toBe(true);
    });

    it('faz login por telefone OU e-mail, com a mesma senha', async () => {
      const porTelefone = await api()
        .post(url('/client-auth/login'))
        .send({ identifier: clientPhone, password: clientPassword })
        .expect(200);
      const porEmail = await api()
        .post(url('/client-auth/login'))
        .send({ identifier: clientEmail, password: clientPassword })
        .expect(200);

      expect(porTelefone.body.client.id).toBe(porEmail.body.client.id);
    });

    it('usa a mesma mensagem de erro do protótipo em credencial inválida', async () => {
      const response = await api()
        .post(url('/client-auth/login'))
        .send({ identifier: clientPhone, password: 'ErradaDeProposito1' })
        .expect(401);

      expect(response.body.message).toBe('Telefone/e-mail ou senha incorretos');
    });

    it('recusa cadastro com telefone já verificado', async () => {
      const response = await api()
        .post(url('/client-auth/register'))
        .send({
          firstName: 'Outro',
          lastName: 'Cliente',
          phone: clientPhone,
          email: `duplicado-${run}@barbervp.test`,
          confirmEmail: `duplicado-${run}@barbervp.test`,
          password: clientPassword,
          confirmPassword: clientPassword,
          acceptTerms: true,
        })
        .expect(409);

      expect(response.body.code).toBe('PHONE_IN_USE');
    });

    it('recupera a senha pelo mesmo fluxo de OTP', async () => {
      const challenge = await api()
        .post(url('/client-auth/password/forgot'))
        .send({ identifier: clientPhone })
        .expect(202);

      const code = await lastOtpFor(normalizedPhone);
      const verified = await api()
        .post(url('/client-auth/otp/verify'))
        .send({ challengeId: challenge.body.challengeId, code })
        .expect(200);

      expect(verified.body.kind).toBe('password-reset');

      await api()
        .post(url('/client-auth/password/reset'))
        .send({
          resetToken: verified.body.resetToken,
          password: 'RecuperadaBvp9',
          confirmPassword: 'RecuperadaBvp9',
        })
        .expect(204);

      await api()
        .post(url('/client-auth/login'))
        .send({ identifier: clientPhone, password: 'RecuperadaBvp9' })
        .expect(200);

      // O token de troca é de uso único.
      await api()
        .post(url('/client-auth/password/reset'))
        .send({
          resetToken: verified.body.resetToken,
          password: 'OutraSenha123',
          confirmPassword: 'OutraSenha123',
        })
        .expect(400);
    });

    it('não revela se o telefone tem conta na recuperação', async () => {
      const semConta = `(16) 9 9000-${run.slice(2)}`;
      const response = await api()
        .post(url('/client-auth/password/forgot'))
        .send({ identifier: semConta })
        .expect(202);

      // A forma da resposta é idêntica à do caso com conta…
      expect(Object.keys(response.body).sort()).toEqual(
        ['challengeId', 'channel', 'destinationMasked', 'expiresInSeconds', 'resendInSeconds'].sort(),
      );

      // …mas nenhuma mensagem foi enviada ao número de terceiro.
      const destino = `55${semConta.replace(/\D/g, '')}`;
      expect(await prisma.notificationOutbox.count({ where: { recipient: destino } })).toBe(0);
    });

    it('a sessão do cliente usa audience própria e não abre o painel', async () => {
      const login = await api()
        .post(url('/client-auth/login'))
        .send({ identifier: clientPhone, password: 'RecuperadaBvp9' })
        .expect(200);

      await api()
        .get(url('/client-auth/me'))
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);

      await api()
        .get(url('/auth/me'))
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });
  });
});
