import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PlanTier, featuresForTier } from '@barbervp/types';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * `GET /public/saas-plans` — a fonte de preço da landing de vendas (fase 10).
 *
 * O caso que mais importa aqui é a ORDEM DE REGISTRO dos módulos:
 * `PublicBookingController` é `@Controller('public/:slug')` e tem um `@Get()`
 * na raiz, então `/public/saas-plans` casa com ele como `slug = "saas-plans"`
 * se o `PublicPlansModule` não vier antes no `AppModule`. O sintoma seria um
 * 403 `TENANT_REQUIRED` (o `TenantGuard` não acha barbearia com esse slug) — e
 * a landing publicaria uma seção de planos vazia sem ninguém perceber, porque
 * `fetchSaasPlans` degrada de propósito em vez de estourar.
 *
 * Uma reorganização inocente do array de `imports` reintroduz o bug. Por isso
 * ele tem teste próprio.
 */
describe('planos públicos (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let prefix: string;

  const createdPlanIds: string[] = [];
  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await prisma.saasPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('responde sem token e sem tenant — não cai no `public/:slug` do booking', async () => {
    // 403 aqui significaria que o `TenantGuard` tentou resolver "saas-plans"
    // como slug de barbearia, ou seja, o `BookingModule` casou primeiro.
    const response = await api().get(url('/public/saas-plans')).expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('devolve os planos semeados com preço, destaque e cópia de marketing', async () => {
    const { body } = await api().get(url('/public/saas-plans')).expect(200);
    const plans = body as Array<Record<string, unknown>>;

    const profissional = plans.find((plan) => plan.id === 'profissional');
    expect(profissional).toMatchObject({
      name: 'Profissional',
      priceCents: 8_900,
      highlight: true,
      baseLabel: 'Tudo do Essencial, mais:',
      maxBarbers: 4,
    });
    // Os bullets são o que a landing renderiza: vazio aqui é a seção de planos
    // sem conteúdo na página.
    expect(profissional?.marketingFeatures).toContain('Comissões automáticas');

    // `id` é o `code`, não o cuid — é ele que vai no `/cadastro?plano=`.
    expect(plans.map((plan) => plan.id)).toEqual(
      expect.arrayContaining(['essencial', 'profissional', 'avancado']),
    );
  });

  it('ordena por preço crescente e esconde plano inativo', async () => {
    const hidden = await prisma.saasPlan.create({
      data: {
        code: `zz-inativo-${Date.now().toString().slice(-6)}`,
        name: 'Plano desativado',
        priceCents: 1,
        tier: PlanTier.ESSENCIAL,
        maxBarbers: 1,
        features: featuresForTier(PlanTier.ESSENCIAL),
        active: false,
      },
      select: { id: true, code: true },
    });
    createdPlanIds.push(hidden.id);

    const { body } = await api().get(url('/public/saas-plans')).expect(200);
    const plans = body as Array<{ id: string; priceCents: number }>;

    expect(plans.map((plan) => plan.id)).not.toContain(hidden.code);

    const prices = plans.map((plan) => plan.priceCents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('marca a resposta como cacheável — ela é igual para todo visitante', async () => {
    const response = await api().get(url('/public/saas-plans')).expect(200);

    expect(response.headers['cache-control']).toContain('public');
    expect(response.headers['cache-control']).toContain('max-age=300');
    // Nenhum dado de sessão pode atravessar uma resposta que a borda vai
    // guardar e servir a outra pessoa.
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
