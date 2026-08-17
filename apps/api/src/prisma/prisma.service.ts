import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../config/configuration';

/**
 * Cliente dentro de `$transaction` — mesmo `PrismaClient` sem os métodos de
 * ciclo de vida. Serviços que recebem a transação de fora tipam por aqui em vez
 * de repetir o `Omit<...>` do Prisma em cada assinatura.
 */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(CONFIG) config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    super({
      datasources: { db: { url: config.databaseUrl } },
      log: config.isProduction
        ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
        : [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ],
    });
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    // Query logada sem `params` — evita despejar telefone/e-mail no log.
    (this as unknown as { $on: (e: 'query', cb: (ev: Prisma.QueryEvent) => void) => void }).$on(
      'query',
      (event) => {
        this.logger.debug({ durationMs: event.duration, query: event.query }, 'prisma query');
      },
    );

    await this.$connect();
    this.logger.info('Prisma conectado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Ping barato usado pelo `/health`. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
