import { hash } from '@node-rs/argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { BRAZIL_UFS, ErrorCode } from '@barbervp/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';
import { RedisService } from '../src/redis/redis.service';

/**
 * Wizard **Configurar barbearia** (agente 30) de ponta a ponta.
 *
 * O que estes casos protegem, em ordem de importância:
 *
 *  1. **A obrigatoriedade do wizard é do SERVIDOR.** `POST /onboarding/complete`
 *     recusa enquanto faltar passo obrigatório (1, 2, 4 ou 6). Antes bastava
 *     chamar a rota avulsa para marcar `onboardingDoneAt` e destravar o painel
 *     inteiro sem um serviço sequer cadastrado — o guard do navegador era a
 *     ÚNICA barreira, e guard de navegador não é barreira;
 *  2. **o link público não leva a 404** — era `{base}/agendar/{slug}`, e a
 *     página da barbearia é `{base}/{slug}` (dívida da fase 11);
 *  3. **logo e capa só entram por upload** — `PUT /onboarding/identity` recusa
 *     URL digitada, e `POST /my-page/images/:slot` grava o MESMO campo que a
 *     aba Minha Página grava;
 *  4. **a lista de municípios vem do cache na segunda chamada** — é o contrato
 *     que justifica proxiar o IBGE em vez de chamar do navegador;
 *  5. **slug reservado é recusa PRÓPRIA** (`SLUG_RESERVED`), não "já está em
 *     uso": o primeiro nunca vai ficar livre.
 */
describe('onboarding — wizard obrigatório, cidades e upload (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;
  let redis: RedisService;

  const run = Date.now().toString().slice(-8);
  const slug = `e2e-onb-${run}`;
  const password = 'OnboardingForte1!';
  const ownerEmail = `e2e-onb-owner-${run}@barbervp.test`;
  const barberEmail = `e2e-onb-barber-${run}@barbervp.test`;

  let tenantId: string;
  let ownerToken: string;
  let barberToken: string;
  let publicBase: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;
  const as = (token: string) => ({
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${token}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${token}`),
    put: (path: string) => api().put(url(path)).set('Authorization', `Bearer ${token}`),
    delete: (path: string) => api().delete(url(path)).set('Authorization', `Bearer ${token}`),
  });
  const asOwner = () => as(ownerToken);

  /** Os quatro passos obrigatórios, na ordem — usado para chegar ao `complete`. */
  const saveProfile = () =>
    asOwner()
      .put('/onboarding/profile')
      .send({ name: 'Barbearia Onboarding (e2e)', phone: '(11) 98765-4321' })
      .expect(200);

  const saveLocation = (extra: Record<string, unknown> = {}) =>
    asOwner()
      .put('/onboarding/location')
      .send({
        zip: '01310100',
        street: 'Avenida Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        ...extra,
      })
      .expect(200);

  const saveServices = () =>
    asOwner()
      .put('/onboarding/services')
      .send({ services: [{ name: 'Corte Onboarding', durationMin: 30, priceCents: 5_000 }] })
      .expect(200);

  const saveHours = () =>
    asOwner()
      .put('/onboarding/business-hours')
      .send({
        hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          opensAt: 540,
          closesAt: 1_200,
          closed: weekday === 0,
        })),
      })
      .expect(200);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const config = app.get<AppConfig>(CONFIG);
    prefix = config.prefix;
    publicBase = config.urls.publicBooking;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    redis = app.get(RedisService);

    // Tenant NU de propósito: sem settings, sem serviço, sem horário. É o
    // estado real de quem acabou de se cadastrar, e é sobre ele que a
    // obrigatoriedade tem de valer.
    const tenant = await prisma.tenant.create({
      data: { slug, name: 'Barbearia Onboarding (e2e)' },
      select: { id: true },
    });
    tenantId = tenant.id;

    const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: 'dona onboarding',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.OWNER } },
      },
    });

    await prisma.user.create({
      data: {
        email: barberEmail,
        name: 'Barbeiro Onboarding',
        passwordHash,
        memberships: { create: { tenantId, role: MembershipRole.BARBER } },
      },
    });

    const login = async (email: string) => {
      const response = await api().post(url('/auth/login')).send({ email, password }).expect(200);
      return response.body.accessToken as string;
    };
    ownerToken = await login(ownerEmail);
    barberToken = await login(barberEmail);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: `e2e-onb-${run}` } } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${run}@barbervp.test` } } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── Obrigatoriedade ─────────────────────────────────────────────────────

  describe('POST /onboarding/complete só conclui com os passos obrigatórios', () => {
    it('recusa com 409 e lista TODOS os passos que faltam', async () => {
      const response = await asOwner().post('/onboarding/complete').expect(409);

      expect(response.body.code).toBe(ErrorCode.ONBOARDING_INCOMPLETE);
      expect(response.body.details.missingSteps).toEqual([1, 2, 4, 6]);
      // E, o que mais importa: NÃO marcou nada.
      const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
      expect(settings?.onboardingDoneAt ?? null).toBeNull();
    });

    it('continua recusando com o último passo obrigatório faltando', async () => {
      await saveProfile();
      await saveLocation();
      await saveServices();

      const response = await asOwner().post('/onboarding/complete').expect(409);
      expect(response.body.code).toBe(ErrorCode.ONBOARDING_INCOMPLETE);
      expect(response.body.details.missingSteps).toEqual([6]);
    });

    it('"Pular etapa" no passo 4 não engana a verificação', async () => {
      // O contador `onboardingStep` já passou de 4 pelos casos acima; o que
      // decide é o DADO. Sem serviço ativo, o passo 4 volta a faltar — é este
      // caso que separa "conferir o contador" de "conferir o que foi gravado",
      // e é a diferença entre a obrigatoriedade valer e ser decorativa.
      await prisma.service.updateMany({
        where: { tenantId },
        data: { active: false, deletedAt: new Date() },
      });

      const response = await asOwner().post('/onboarding/complete').expect(409);
      expect(response.body.details.missingSteps).toContain(4);

      // Reativa pelo banco, não por `PUT /onboarding/services`: `Service` tem
      // `@@unique([tenantId, name])`, e o soft delete guarda o nome — recriar
      // pela rota bateria na UNIQUE. O wizard não passa por aqui (ele reenvia
      // o serviço COM `id`, que o serviço reativa), mas fica registrado.
      await prisma.service.updateMany({
        where: { tenantId },
        data: { active: true, deletedAt: null },
      });
    });

    it('conclui quando os quatro estão gravados, e o passo 3 pulado não impede', async () => {
      await saveHours();

      const response = await asOwner().post('/onboarding/complete').expect(200);
      expect(response.body.completed).toBe(true);

      const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
      expect(settings?.onboardingDoneAt).not.toBeNull();
    });
  });

  // ── Link público ────────────────────────────────────────────────────────

  describe('link público', () => {
    it('é `{base}/{slug}` — sem o `/agendar/` que levava a 404', async () => {
      const state = await asOwner().get('/onboarding').expect(200);

      expect(state.body.publicUrl).toBe(`${publicBase}/${slug}`);
      expect(state.body.publicUrl).not.toContain('/agendar/');
      // A base vem separada, para o campo de slug e o link do fim do wizard
      // dizerem a mesma coisa — é o mesmo valor que `GET /my-page` devolve.
      expect(state.body.publicBaseUrl).toBe(publicBase);

      const myPage = await asOwner().get('/my-page').expect(200);
      expect(myPage.body.publicUrl).toBe(state.body.publicUrl);
    });

    it('slug reservado é recusa própria, não "já está em uso"', async () => {
      const availability = await asOwner().get('/onboarding/slug?slug=cadastro').expect(200);
      expect(availability.body.available).toBe(false);
      expect(availability.body.reserved).toBe(true);

      const response = await asOwner()
        .put('/onboarding/identity')
        .send({ slug: 'cadastro' })
        .expect(409);
      expect(response.body.code).toBe(ErrorCode.SLUG_RESERVED);
    });
  });

  // ── Passo 3: só o slug, e upload de verdade ─────────────────────────────

  describe('passo 3 — identidade', () => {
    it('recusa `logoUrl` digitada: não há segundo caminho de escrita', async () => {
      await asOwner()
        .put('/onboarding/identity')
        .send({ slug, logoUrl: 'https://exemplo.test/logo.png' })
        .expect(400);
    });

    it('o upload grava `logoUrl` da MESMA forma que a Minha Página', async () => {
      // PNG 1×1 real. (O `StorageAdapter` valida o mimetype DECLARADO e o
      // tamanho, não os bytes — ver dívidas do agente 30.)
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );

      const uploaded = await api()
        .post(url('/my-page/images/logo'))
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', png, { filename: 'logo.png', contentType: 'image/png' })
        .expect(201);

      expect(uploaded.body.logoUrl).toEqual(expect.any(String));

      // O passo 3 lê o MESMO campo — é isso que fecha o ciclo: quem sobe pelo
      // wizard vê o arquivo na Minha Página, e vice-versa.
      const state = await asOwner().get('/onboarding').expect(200);
      expect(state.body.identity.logoUrl).toBe(uploaded.body.logoUrl);

      const removed = await asOwner().delete('/my-page/images/logo').expect(200);
      expect(removed.body.logoUrl).toBeNull();
    });
  });

  // ── Passo 2: UFs e municípios ───────────────────────────────────────────

  describe('passo 2 — UF e cidade', () => {
    it('as 27 UFs saem da lista estática, sem chamada externa', async () => {
      const response = await asOwner().get('/onboarding/ufs').expect(200);
      expect(response.body).toHaveLength(27);
      expect(response.body).toEqual([...BRAZIL_UFS]);
    });

    it('recusa UF que não existe', async () => {
      await asOwner().get('/onboarding/cities/XX').expect(400);
    });

    it('serve os municípios do CACHE na segunda chamada', async () => {
      const key = 'bvp:ibge:municipios:AC';
      await redis.client.del(key);

      const first = await asOwner().get('/onboarding/cities/AC').expect(200);
      // O IBGE pode estar fora do ar na máquina que roda a suíte; nesse caso a
      // rota degrada para lista vazia, e é isso que se verifica — o passo nunca
      // trava. Com resposta, o cache tem de existir e servir a segunda chamada.
      if (first.body.length === 0) {
        expect(await redis.client.get(key)).toBeNull();
        return;
      }

      const cached = await redis.client.get(key);
      expect(cached).not.toBeNull();

      // Marca o cache com um município impossível: se a segunda chamada o
      // devolver, ela veio do Redis e não da rede.
      await redis.client.set(key, JSON.stringify([{ id: '9999999', name: 'Município do Cache' }]));
      const second = await asOwner().get('/onboarding/cities/AC').expect(200);
      expect(second.body).toEqual([{ id: '9999999', name: 'Município do Cache' }]);

      await redis.client.del(key);
    });

    it('grava o código IBGE do município junto com o nome', async () => {
      const saved = await saveLocation({ cityIbgeCode: '3550308' });
      expect(saved.body.location.cityIbgeCode).toBe('3550308');
      expect(saved.body.location.city).toBe('São Paulo');

      const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
      expect(settings?.addressCityIbge).toBe('3550308');
      // A linha única renderizada não mudou de forma — é o que a página
      // pública e o WhatsApp exibem.
      expect(settings?.address).toContain('São Paulo/SP');
    });

    it('recusa código de município malformado', async () => {
      await asOwner()
        .put('/onboarding/location')
        .send({
          street: 'Rua Teste',
          number: '1',
          city: 'São Paulo',
          state: 'SP',
          cityIbgeCode: '123',
        })
        .expect(400);
    });
  });

  // ── Vocativo ────────────────────────────────────────────────────────────

  it('o vocativo sai do nome do cadastro, com a inicial em maiúscula', async () => {
    const state = await asOwner().get('/onboarding').expect(200);
    // O cadastro deste tenant tem `name: 'dona onboarding'` — minúsculo, como
    // muita gente digita. O que nunca pode aparecer é pedaço de e-mail.
    expect(state.body.ownerGreetingName).toBe('Dona');
    expect(state.body.ownerGreetingName).not.toContain('@');
    expect(state.body.ownerGreetingName).not.toContain('e2e-onb');
  });

  // ── Papéis ──────────────────────────────────────────────────────────────

  it('BARBER não alcança o wizard — nem para ler, nem para concluir', async () => {
    await as(barberToken).get('/onboarding').expect(403);
    await as(barberToken).post('/onboarding/complete').expect(403);
    await as(barberToken).get('/onboarding/cities/SP').expect(403);
  });
});
