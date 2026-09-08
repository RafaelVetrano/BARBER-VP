import { hash } from '@node-rs/argon2';
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
  const ownerPassword = 'SenhaForte2026!';
  // Celular válido e único por execução: DDD 16 + 9 + 8 dígitos.
  const clientDigits = `${run}00`;
  const clientPhone = `(16) 9 ${clientDigits.slice(0, 4)}-${clientDigits.slice(4)}`;
  const clientEmail = `e2e-cliente-${run}@barbervp.test`;
  const clientPassword = 'ClienteSenha1!';

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  /**
   * Um IP por chamada de cadastro.
   *
   * `/auth/register` e `/auth/register/link` são 5 por HORA por IP — aperto de
   * propósito, porque cadastro é o alvo óbvio de abuso. Uma suíte faz em
   * segundos o que um humano faria em semanas: sem um endereço por chamada, os
   * casos gastariam o teto uns dos outros e virariam 429, um vermelho que não
   * diz nada sobre a regra sob teste. Afrouxar o teto no código para o teste
   * passar seria trocar segurança por conveniência (a mesma decisão que
   * `load-env.ts` registra para os limites do booking); trocar de IP não mexe
   * na regra — e o teto em si continua coberto por `throttle-redis.e2e-spec.ts`.
   */
  let ipSeed = 0;
  const nextIp = (): string => {
    ipSeed += 1;
    return `10.32.${Math.floor(ipSeed / 250) + 1}.${(ipSeed % 250) + 1}`;
  };

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
    // Sem isto o `X-Forwarded-For` de `nextIp()` é ignorado e todos os cadastros
    // deste arquivo contariam no mesmo IP do supertest.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
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

    it('recusa senha fora da regra (8+, maiúscula, número e especial)', async () => {
      const fracas = [
        'abcdefgh', // sem maiúscula, sem número, sem especial
        'senha123', // o que a regra ANTIGA aceitava
        'Senha123', // falta só o especial
        'SENHA@ABC', // falta só o número
      ];

      for (const password of fracas) {
        const response = await api()
          .post(url('/auth/register'))
          .set('X-Forwarded-For', nextIp())
          .send({
            name: 'Fulano de Tal',
            phone: '(16) 9 9111-2233',
            email: `fraca-${run}@barbervp.test`,
            confirmEmail: `fraca-${run}@barbervp.test`,
            password,
            confirmPassword: password,
            shopName: 'Barbearia Teste',
            acceptTerms: true,
          })
          .expect(400);

        expect(response.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('aceita senha SEM minúscula — são quatro requisitos, não cinco', async () => {
      // `SENHA@2026` é a decisão do dono do produto de 2026-09-04 virada teste:
      // se alguém acrescentar minúscula como quinto requisito, isto reprova.
      const email = `semminuscula-${run}@barbervp.test`;
      const response = await api()
        .post(url('/auth/register'))
        .set('X-Forwarded-For', nextIp())
        .send({
          name: 'Sem Minuscula',
          phone: `(16) 9 9${run.slice(0, 3)}-${run.slice(3)}1`,
          email,
          confirmEmail: email,
          password: 'SENHA@2026',
          confirmPassword: 'SENHA@2026',
          shopName: `Sem Minuscula ${run}`,
          acceptTerms: true,
        })
        .expect(201);

      const created = response.body.user.id;
      await prisma.tenant.deleteMany({ where: { memberships: { some: { userId: created } } } });
      await prisma.user.delete({ where: { id: created } });
    });

    it('recusa confirmação de e-mail e de senha divergentes', async () => {
      const email = `divergente-${run}@barbervp.test`;
      const base = {
        name: 'Confirma Errado',
        phone: '(16) 9 9111-2244',
        shopName: 'Barbearia Confirma',
        acceptTerms: true,
      };

      const emailDiferente = await api()
        .post(url('/auth/register'))
        .set('X-Forwarded-For', nextIp())
        .send({
          ...base,
          email,
          confirmEmail: `outro-${email}`,
          password: ownerPassword,
          confirmPassword: ownerPassword,
        })
        .expect(400);
      expect(emailDiferente.body.code).toBe('VALIDATION_ERROR');

      const senhaDiferente = await api()
        .post(url('/auth/register'))
        .set('X-Forwarded-For', nextIp())
        .send({
          ...base,
          email,
          confirmEmail: email,
          password: ownerPassword,
          confirmPassword: `${ownerPassword}x`,
        })
        .expect(400);
      expect(senhaDiferente.body.code).toBe('VALIDATION_ERROR');

      // Nenhum dos dois pode ter criado conta.
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('cria User + Tenant (TRIAL) + Membership OWNER em uma transação', async () => {
      const response = await api()
        .post(url('/auth/register'))
        .set('X-Forwarded-For', nextIp())
        .send({
          name: 'Ana Paula Souza',
          phone: '(16) 9 9111-2233',
          email: ownerEmail,
          confirmEmail: ownerEmail,
          password: ownerPassword,
          confirmPassword: ownerPassword,
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
        .set('X-Forwarded-For', nextIp())
        .send({
          name: 'Outro Alguém',
          phone: '(16) 9 9444-5566',
          email: ownerEmail,
          confirmEmail: ownerEmail,
          password: ownerPassword,
          confirmPassword: ownerPassword,
          shopName: 'Outra Barbearia',
          acceptTerms: true,
        })
        .expect(409);

      expect(response.body.code).toBe('EMAIL_IN_USE');
      expect(response.body.message).toContain('Já existe um cadastro com este e-mail');
    });

    it('recusa o mesmo CELULAR num segundo cadastro, em outro formato', async () => {
      // O cadastro de cima gravou `(16) 9 9111-2233`. Aqui o mesmo número
      // chega em E.164 com `+`: se a checagem não normalizasse antes de
      // consultar, este cadastro passaria e o índice único estouraria com um
      // 500 — ou, pior, passaria mesmo, se o índice não existisse.
      const email = `outro-celular-${run}@barbervp.test`;
      const response = await api()
        .post(url('/auth/register'))
        .set('X-Forwarded-For', nextIp())
        .send({
          name: 'Mesmo Celular',
          phone: '+55 16 99111-2233',
          email,
          confirmEmail: email,
          password: ownerPassword,
          confirmPassword: ownerPassword,
          shopName: 'Barbearia do Mesmo Celular',
          acceptTerms: true,
        })
        .expect(409);

      expect(response.body.code).toBe('PHONE_IN_USE');
      expect(response.body.message).toContain('Este celular já está em uso');
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('dois User sem telefone convivem — é a premissa do índice único', async () => {
      // `User.phone` é `@unique` E nulável: no Postgres vários `NULL` convivem
      // num índice único. É isso que deixa o convite de equipe criar barbeiro
      // sem telefone. Se esta premissa cair, o `@unique` precisa virar índice
      // parcial — e o teste é quem avisa.
      const criados = await Promise.all(
        [1, 2].map((n) =>
          prisma.user.create({
            data: {
              email: `sem-telefone-${n}-${run}@barbervp.test`,
              name: `Sem Telefone ${n}`,
              passwordHash: 'nao-usado-neste-teste',
              phone: null,
            },
            select: { id: true, phone: true },
          }),
        ),
      );

      expect(criados).toHaveLength(2);
      expect(criados.every((u) => u.phone === null)).toBe(true);

      await prisma.user.deleteMany({ where: { id: { in: criados.map((u) => u.id) } } });
    });

    it('a corrida do cadastro vira 409 do CAMPO certo, não o P2002 genérico', async () => {
      // `register` consulta antes de criar, mas consulta e `create` não são
      // atômicos: dois envios simultâneos passam os dois pela consulta. O que
      // salva é o índice — e o que traduz o P2002 para o código que o
      // formulário sabe tratar é o `uniqueOrConflict` do serviço.
      const emailNovo = `corrida-email-${run}@barbervp.test`;
      const phoneNovo = `(16) 9 9${run.slice(0, 3)}-${run.slice(3)}7`;

      const enviar = (email: string, phone: string) =>
        api()
          .post(url('/auth/register'))
          .set('X-Forwarded-For', nextIp())
          .send({
            name: 'Corrida Simultanea',
            phone,
            email,
            confirmEmail: email,
            password: ownerPassword,
            confirmPassword: ownerPassword,
            shopName: `Corrida ${run}`,
            acceptTerms: true,
          });

      // Mesmo e-mail, celulares diferentes: quem perder a corrida bate no
      // índice de e-mail.
      const porEmail = await Promise.all([
        enviar(emailNovo, phoneNovo),
        enviar(emailNovo, `(16) 9 9${run.slice(0, 3)}-${run.slice(3)}8`),
      ]);
      const criadosPorEmail = porEmail.filter((r) => r.status === 201);
      const recusadosPorEmail = porEmail.filter((r) => r.status === 409);
      expect(criadosPorEmail).toHaveLength(1);
      expect(recusadosPorEmail).toHaveLength(1);
      expect(recusadosPorEmail[0]!.body.code).toBe('EMAIL_IN_USE');

      // Mesmo celular, e-mails diferentes: o índice que fala é o de telefone,
      // e o código precisa mudar junto.
      const phoneDisputado = `(16) 9 9${run.slice(0, 3)}-${run.slice(3)}9`;
      const porTelefone = await Promise.all([
        enviar(`corrida-fone-a-${run}@barbervp.test`, phoneDisputado),
        enviar(`corrida-fone-b-${run}@barbervp.test`, phoneDisputado),
      ]);
      const criadosPorFone = porTelefone.filter((r) => r.status === 201);
      const recusadosPorFone = porTelefone.filter((r) => r.status === 409);
      expect(criadosPorFone).toHaveLength(1);
      expect(recusadosPorFone).toHaveLength(1);
      expect(recusadosPorFone[0]!.body.code).toBe('PHONE_IN_USE');

      const lixo = [...porEmail, ...porTelefone]
        .filter((r) => r.status === 201)
        .map((r) => r.body.user.id as string);
      await prisma.tenant.deleteMany({ where: { memberships: { some: { userId: { in: lixo } } } } });
      await prisma.user.deleteMany({ where: { id: { in: lixo } } });
    });

    it('duas barbearias com o MESMO nome se cadastram sem erro', async () => {
      // `Tenant.name` NÃO é único, e é decisão de produto (2026-09-04): o
      // `slug` já resolve a colisão que importa, que é a da URL pública.
      // Barbearia é ramo de nome repetido — travar a segunda "Barbearia do
      // Zé" do Brasil seria um erro sem sentido do ponto de vista dela.
      const mesmoNome = `Barbearia Homonima ${run}`;
      const criados: string[] = [];

      for (const n of [1, 2]) {
        const email = `homonima-${n}-${run}@barbervp.test`;
        const response = await api()
          .post(url('/auth/register'))
          .set('X-Forwarded-For', nextIp())
          .send({
            name: `Dono Homonimo ${n}`,
            phone: `(16) 9 8${run.slice(0, 3)}-${run.slice(3)}${n}`,
            email,
            confirmEmail: email,
            password: ownerPassword,
            confirmPassword: ownerPassword,
            shopName: mesmoNome,
            acceptTerms: true,
          })
          .expect(201);
        criados.push(response.body.user.id);
      }

      const tenants = await prisma.tenant.findMany({
        where: { name: mesmoNome },
        select: { slug: true },
      });
      expect(tenants).toHaveLength(2);
      // Mesmo nome, slugs diferentes — é o slug que garante a unicidade útil.
      expect(new Set(tenants.map((t) => t.slug)).size).toBe(2);

      await prisma.tenant.deleteMany({ where: { name: mesmoNome } });
      await prisma.user.deleteMany({ where: { id: { in: criados } } });
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
        .send({ email: ownerEmail, password: 'SenhaErrada123!' })
        .expect(401);

      const contaInexistente = await api()
        .post(url('/auth/login'))
        .send({ email: `naoexiste-${run}@barbervp.test`, password: 'SenhaErrada123!' })
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
        .send({ currentPassword: ownerPassword, newPassword: 'NovaSenha2026!' })
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
        .send({ email: ownerEmail, password: 'NovaSenha2026!' })
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
        .send({ identifier: clientPhone, password: 'ErradaDeProposito1!' })
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
          password: 'RecuperadaBvp9!',
          confirmPassword: 'RecuperadaBvp9!',
        })
        .expect(204);

      await api()
        .post(url('/client-auth/login'))
        .send({ identifier: clientPhone, password: 'RecuperadaBvp9!' })
        .expect(200);

      // O token de troca é de uso único.
      await api()
        .post(url('/client-auth/password/reset'))
        .send({
          resetToken: verified.body.resetToken,
          password: 'OutraSenha123!',
          confirmPassword: 'OutraSenha123!',
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
        .send({ identifier: clientPhone, password: 'RecuperadaBvp9!' })
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
  // ── Senha antiga, vínculo e telefone (agente 32) ───────────────────────────

  describe('regras do agente 32', () => {
    const argon = (senha: string) =>
      hash(senha, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

    const legadoEmail = `legado-${run}@barbervp.test`;
    const legadoSenha = 'senha123'; // válida na regra ANTIGA, recusada na nova
    const criados: string[] = [];

    afterAll(async () => {
      await prisma.tenant.deleteMany({
        where: { memberships: { some: { userId: { in: criados } } } },
      });
      await prisma.client.deleteMany({ where: { userId: { in: criados } } });
      await prisma.user.deleteMany({ where: { id: { in: criados } } });
    });

    it('quem já tinha senha fraca CONTINUA entrando — a regra vale para senha nova', async () => {
      // A conta nasce direto no banco, como as que já existiam quando a regra
      // apertou. Nenhum caminho de LOGIN pode aplicar `isPasswordValid`: fazer
      // isso trancaria do lado de fora todo mundo que se cadastrou antes.
      const user = await prisma.user.create({
        data: {
          email: legadoEmail,
          name: 'Conta Antiga',
          passwordHash: await argon(legadoSenha),
        },
        select: { id: true },
      });
      criados.push(user.id);

      const login = await api()
        .post(url('/auth/login'))
        .send({ email: legadoEmail, password: legadoSenha })
        .expect(200);
      expect(login.body.accessToken).toEqual(expect.any(String));

      // Mas um cadastro NOVO com a mesma senha é recusado — é a diferença
      // entre "a regra vale daqui pra frente" e "a regra invalidou o passado".
      const novo = `legado-novo-${run}@barbervp.test`;
      await api()
        .post(url('/auth/register'))
        .set('X-Forwarded-For', nextIp())
        .send({
          name: 'Cadastro Novo',
          phone: `(16) 9 7${run.slice(0, 3)}-${run.slice(3)}1`,
          email: novo,
          confirmEmail: novo,
          password: legadoSenha,
          confirmPassword: legadoSenha,
          shopName: `Legado ${run}`,
          acceptTerms: true,
        })
        .expect(400);
    });

    it('e-mail de cliente ainda abre o card de vínculo, e o vínculo funciona', async () => {
      // O teste que protege o fluxo da fase 03: se `check-email` deixar de
      // devolver `client`, a tela some com o "Que bom te ver de novo!" e o
      // cadastro vira um 409 sem saída para quem já é cliente da casa.
      const email = `vinculo-${run}@barbervp.test`;
      const senha = 'ClienteVinculo@1';
      const telefone = `55169${run}11`.slice(0, 13);

      const client = await prisma.client.create({
        data: {
          phone: telefone,
          name: 'Cliente Que Vira Dono',
          email,
          passwordHash: await argon(senha),
          phoneVerifiedAt: new Date(),
        },
        select: { id: true },
      });

      const estado = await api().post(url('/auth/check-email')).send({ email }).expect(200);
      expect(estado.body.status).toBe('client');
      expect(estado.body.account.name).toBe('Cliente Que Vira Dono');

      const vinculo = await api()
        .post(url('/auth/register/link'))
        .set('X-Forwarded-For', nextIp())
        .send({ email, password: senha, shopName: `Vinculada ${run}`, acceptTerms: true })
        .expect(201);

      criados.push(vinculo.body.user.id);

      // As duas pontas amarradas: o histórico do cliente sobrevive.
      const depois = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
      expect(depois.userId).toBe(vinculo.body.user.id);

      // Telefone LIVRE: o `User` herda o número do `Client`.
      const user = await prisma.user.findUniqueOrThrow({ where: { id: vinculo.body.user.id } });
      expect(user.phone).toBe(telefone);
    });

    it('vínculo com telefone JÁ OCUPADO não quebra — o User nasce sem telefone', async () => {
      // O caso delicado: o número vem do `Client`, não de um campo da tela. Se
      // outro `User` já o tiver, o dono não teria onde corrigi-lo — então a
      // escolha é nascer sem telefone e repor em "Meu perfil", em vez de
      // perder o vínculo (e com ele o histórico do cliente).
      const telefone = `55169${run}22`.slice(0, 13);
      const dono = await prisma.user.create({
        data: {
          email: `dono-do-numero-${run}@barbervp.test`,
          name: 'Dono do Numero',
          passwordHash: await argon('DonoDoNumero@1'),
          phone: telefone,
        },
        select: { id: true },
      });
      criados.push(dono.id);

      const email = `vinculo-ocupado-${run}@barbervp.test`;
      const senha = 'ClienteOcupado@1';
      await prisma.client.create({
        data: {
          phone: telefone,
          name: 'Cliente Com Numero Ocupado',
          email,
          passwordHash: await argon(senha),
          phoneVerifiedAt: new Date(),
        },
      });

      const vinculo = await api()
        .post(url('/auth/register/link'))
        .set('X-Forwarded-For', nextIp())
        .send({ email, password: senha, shopName: `Vinculada Ocupada ${run}`, acceptTerms: true })
        .expect(201);

      criados.push(vinculo.body.user.id);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: vinculo.body.user.id } });
      expect(user.phone).toBeNull();

      // O `Client` continua com o número — a unicidade é do LOGIN, não do
      // cadastro do cliente.
      const client = await prisma.client.findFirstOrThrow({ where: { email } });
      expect(client.phone).toBe(telefone);

      // E o dono original não perdeu nada.
      const original = await prisma.user.findUniqueOrThrow({ where: { id: dono.id } });
      expect(original.phone).toBe(telefone);
    });

    it('troca de senha do vinculado atualiza os DOIS hashes sob a regra nova', async () => {
      // No vínculo, `User` e `Client` guardam o MESMO `passwordHash`. Como a
      // regra é única em `packages/types`, os dois lados ficam coerentes por
      // construção — mas isto é a premissa inteira do fluxo, então vai coberta.
      const email = `troca-vinculada-${run}@barbervp.test`;
      const senhaAntiga = 'TrocaVinculo@1';
      const senhaNova = 'TrocaVinculo@2026';
      const telefone = `55169${run}33`.slice(0, 13);

      await prisma.client.create({
        data: {
          phone: telefone,
          name: 'Cliente Que Troca Senha',
          email,
          passwordHash: await argon(senhaAntiga),
          phoneVerifiedAt: new Date(),
        },
      });

      const vinculo = await api()
        .post(url('/auth/register/link'))
        .set('X-Forwarded-For', nextIp())
        .send({ email, password: senhaAntiga, shopName: `Troca ${run}`, acceptTerms: true })
        .expect(201);
      criados.push(vinculo.body.user.id);

      // Senha nova FORA da regra é recusada antes de tocar em qualquer hash.
      await api()
        .post(url('/auth/password/change'))
        .set('Authorization', `Bearer ${vinculo.body.accessToken}`)
        .send({ currentPassword: senhaAntiga, newPassword: 'senha123' })
        .expect(400);

      await api()
        .post(url('/auth/password/change'))
        .set('Authorization', `Bearer ${vinculo.body.accessToken}`)
        .send({ currentPassword: senhaAntiga, newPassword: senhaNova })
        .expect(204);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: vinculo.body.user.id } });
      const client = await prisma.client.findFirstOrThrow({ where: { email } });
      expect(client.passwordHash).toBe(user.passwordHash);

      // E a senha nova entra pelos DOIS lados.
      await api().post(url('/auth/login')).send({ email, password: senhaNova }).expect(200);
      await api()
        .post(url('/client-auth/login'))
        .send({ identifier: email, password: senhaNova })
        .expect(200);
    });
  });
});
