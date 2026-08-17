import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../config/configuration';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;

  constructor(
    @Inject(CONFIG) config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisService.name);
    this.client = new Redis(config.redisUrl, {
      // Conexão preguiçosa: o boot não trava se o Redis subir alguns segundos
      // depois — o `/health` reporta o estado real de qualquer forma.
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 3_000),
    });

    this.client.on('error', (error: Error) => {
      this.logger.warn({ err: error.message }, 'redis indisponível');
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.info('Redis conectado');
    } catch (error) {
      this.logger.warn({ err: (error as Error).message }, 'Redis não conectou no boot');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }

  /** Ping usado pelo `/health` — lança se o Redis não responder. */
  async ping(): Promise<void> {
    const reply = await this.client.ping();
    if (reply !== 'PONG') {
      throw new Error(`resposta inesperada do redis: ${reply}`);
    }
  }
}
