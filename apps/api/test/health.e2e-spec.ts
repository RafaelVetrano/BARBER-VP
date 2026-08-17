import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

describe('GET /health (e2e)', () => {
  let app: INestApplication;
  let prefix: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 e reflete a conexão real com Postgres e Redis', async () => {
    const response = await request(app.getHttpServer()).get(`/${prefix}/health`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      services: {
        database: { status: 'up' },
        redis: { status: 'up' },
      },
    });
    expect(response.body.services.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('devolve o header de correlação x-request-id', async () => {
    const response = await request(app.getHttpServer()).get(`/${prefix}/health`);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });
});
