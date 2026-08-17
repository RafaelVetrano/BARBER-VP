import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { buildConfig, CONFIG, type AppConfig } from './configuration';
import { ENV_KEYS, validateEnv, type Env } from './env.schema';

/**
 * Config global. `validate` roda antes de qualquer provider ser instanciado,
 * então um env inválido derruba o processo no boot em vez de virar 500 depois.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // `.env` da raiz vale para rodar fora do docker; no compose as vars vêm
      // do ambiente do container e têm precedência.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>): AppConfig => {
        // A lista de chaves sai do próprio `envSchema` (`ENV_KEYS`), não de uma
        // cópia à mão: acrescentar uma env ao schema já a faz chegar aqui.
        const env = Object.fromEntries(
          ENV_KEYS.map((key) => [key, configService.get(key, { infer: true })]),
        ) as Env;

        return buildConfig(env);
      },
    },
  ],
  exports: [CONFIG, NestConfigModule],
})
export class AppConfigModule {}
