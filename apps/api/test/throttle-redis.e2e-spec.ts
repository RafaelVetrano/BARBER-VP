/**
 * O storage Redis do rate limit precisa estar escolhido ANTES de a primeira
 * aplicação subir: o `@nestjs/config` roda com `cache: true`, então mudar a
 * variável depois não teria efeito. Por isso a atribuição fica no topo do
 * arquivo, e por isso este caso não mora junto do resto do hardening.
 *
 * `test/load-env.ts` deixa a suíte inteira em `memory` — este arquivo é a
 * única exceção, e é o que dá cobertura ao caminho usado em produção.
 */
process.env.THROTTLE_STORAGE = 'redis';

import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * A propriedade que justifica mover o rate limit para o Redis: DUAS instâncias
 * da API compartilham o mesmo contador.
 *
 * Era a dívida da fase 03 — com a contagem em memória, N réplicas atrás do
 * balanceador davam a cada uma o seu próprio teto, e o limite real de um
 * ataque de força bruta virava N × o configurado.
 */
describe('rate limit compartilhado entre réplicas (e2e)', () => {
  let replicaA: INestApplication;
  let replicaB: INestApplication;
  let prefix: string;

  /** Limite de `/auth/check-email`, declarado no controller. */
  const CHECK_EMAIL_LIMIT = 20;

  const buildReplica = async (): Promise<INestApplication> => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const replica = moduleRef.createNestApplication();
    prefix = replica.get<AppConfig>(CONFIG).prefix;
    replica.setGlobalPrefix(prefix);
    replica.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    // Sem isto o `X-Forwarded-For` é ignorado e as duas réplicas contariam
    // pelo IP do supertest — o teste passaria sem provar nada.
    replica.getHttpAdapter().getInstance().set('trust proxy', 1);
    await replica.init();
    return replica;
  };

  beforeAll(async () => {
    replicaA = await buildReplica();
    replicaB = await buildReplica();
  });

  afterAll(async () => {
    await replicaA?.close();
    await replicaB?.close();
  });

  it('o storage configurado é mesmo o Redis', () => {
    expect(replicaA.get<AppConfig>(CONFIG).throttle.storage).toBe('redis');
  });

  it('o teto gasto numa réplica já vale na outra', async () => {
    // IP próprio deste caso: o contador é por IP + rota, e o Redis é o de
    // desenvolvimento. Um endereço exclusivo evita herdar contagem de outra
    // execução e evita atrapalhar qualquer outro teste.
    const ip = `10.9.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;

    const hit = (replica: INestApplication) =>
      request(replica.getHttpServer())
        .post(`/${prefix}/auth/check-email`)
        .set('X-Forwarded-For', ip)
        .send({ email: 'compartilhado@barbervp.test' });

    // Gasta o teto inteiro na réplica A.
    for (let attempt = 0; attempt < CHECK_EMAIL_LIMIT; attempt += 1) {
      const response = await hit(replicaA);
      expect(response.status).toBe(200);
    }

    // A réplica B nunca viu este IP. Ela só sabe do estouro porque o contador
    // mora no Redis; com storage em memória, esta chamada devolveria 200.
    const onReplicaB = await hit(replicaB);
    expect(onReplicaB.status).toBe(429);
    expect(onReplicaB.body.code).toBe('RATE_LIMITED');
  });
});
