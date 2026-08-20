import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Hardening (fase 09).
 *
 * O que se verifica aqui é o que o `main.ts` monta em volta da aplicação:
 * teto de payload, cabeçalhos de segurança e o contrato de erro nas bordas
 * que não passam por controller nenhum (corpo grande demais, JSON quebrado).
 *
 * O rate limit compartilhado no Redis mora em `throttle-redis.e2e-spec.ts`,
 * em arquivo separado porque precisa do env ajustado ANTES de a primeira
 * aplicação ser montada — o `@nestjs/config` cacheia.
 */
describe('hardening (e2e)', () => {
  let app: INestApplication;
  let prefix: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);

    // Espelha o `main.ts` — é justamente esta camada que está sob teste.
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
    app.use(json({ limit: '256kb' }));
    app.use(urlencoded({ extended: true, limit: '256kb' }));
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('teto de payload', () => {
    it('recusa corpo acima de 256kb', async () => {
      const huge = 'x'.repeat(400 * 1024);

      const response = await api()
        .post(url('/auth/check-email'))
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: huge }));

      expect(response.status).toBe(413);
    });

    it('aceita um corpo normal na mesma rota', async () => {
      const response = await api()
        .post(url('/auth/check-email'))
        .send({ email: 'payload-ok@barbervp.test' });

      expect(response.status).toBe(200);
    });
  });

  describe('cabeçalhos de segurança', () => {
    it('helmet responde com os cabeçalhos esperados', async () => {
      const response = await api().get(url('/health')).expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      // O helmet remove a assinatura do Express — é ela que entrega a stack.
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('contrato de erro', () => {
    it('404 sai como { code, message }', async () => {
      const response = await api().get(url('/rota-que-nao-existe')).expect(404);

      expect(response.body).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
      });
    });

    it('erro de validação sai como VALIDATION_ERROR com details', async () => {
      const response = await api().post(url('/auth/login')).send({ email: 'nao-e-email' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details).toBeDefined();
    });

    it('campo desconhecido é recusado (forbidNonWhitelisted)', async () => {
      const response = await api()
        .post(url('/auth/check-email'))
        .send({ email: 'a@b.co', campoIntruso: 1 });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('401 sem token também segue o contrato', async () => {
      const response = await api().get(url('/clients')).expect(401);

      expect(response.body.code).toBeDefined();
      expect(response.body.message).toBeDefined();
    });
  });

  describe('JSON malformado', () => {
    it('sai como 400 no contrato, não 500', async () => {
      const response = await api()
        .post(url('/auth/check-email'))
        .set('Content-Type', 'application/json')
        .send('{"email": ');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('BAD_REQUEST');
      expect(response.body.message).toEqual(expect.any(String));
    });
  });

  describe('log sem PII', () => {
    it('a resposta de erro não devolve a senha enviada', async () => {
      const response = await api()
        .post(url('/auth/login'))
        .send({ email: 'ninguem@barbervp.test', password: 'SenhaSecreta123' });

      expect(JSON.stringify(response.body)).not.toContain('SenhaSecreta123');
    });
  });

});
