import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { REQUEST_ID_HEADER, TENANT_HEADER } from '@barbervp/types';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { CONFIG, type AppConfig } from './config/configuration';

/** Tags do Swagger — uma por módulo, conforme os módulos vão nascendo. */
const SWAGGER_TAGS: Array<[name: string, description: string]> = [
  ['health', 'Estado da API e dependências'],
  ['auth', 'Autenticação de estabelecimento e cliente (fase 03)'],
  ['tenants', 'Barbearias e configurações (fase 03)'],
  ['booking', 'Agendamento público (fase 04)'],
  ['clients', 'Área do cliente (fase 05)'],
  ['agenda', 'Agenda e equipe do dashboard (fase 06)'],
  ['finance', 'Comandas, caixa e financeiro (fase 07)'],
  ['admin', 'Super admin do SaaS (fase 08)'],
];

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // O CORS explícito é configurado abaixo, com a lista do env.
    cors: false,
    // O parser padrão do Nest é registrado ANTES de qualquer `app.use`, então
    // um `json({ limit })` acrescentado depois nunca veria um corpo grande —
    // o padrão de 100kb já teria recusado. Desligado aqui e registrado abaixo
    // com o limite explícito.
    bodyParser: false,
  });

  app.useLogger(app.get(Logger));

  const config = app.get<AppConfig>(CONFIG);

  app.setGlobalPrefix(config.prefix);

  app.use(
    helmet({
      // A API só serve JSON; o Swagger UI precisa de inline script/style.
      contentSecurityPolicy: config.isProduction
        ? { directives: { defaultSrc: ["'self'"], frameAncestors: ["'none'"] } }
        : false,
      crossOriginEmbedderPolicy: false,
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  /**
   * Teto de payload explícito.
   *
   * O padrão do body-parser (100kb) já é conservador, mas depende de uma
   * versão de dependência — deixar implícito significa que um upgrade pode
   * afrouxá-lo sem ninguém perceber. 256kb cobre com folga o maior corpo real
   * da API (uma comanda cheia, ou os 6 templates de WhatsApp de uma vez) e
   * ainda recusa o upload acidental de um arquivo no lugar de um JSON.
   */
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ extended: true, limit: '256kb' }));

  // O refresh token viaja em cookie httpOnly — sem o parser, `request.cookies`
  // fica vazio e todo `/refresh` responde 401.
  app.use(cookieParser());

  // Sem wildcard: só as quatro origens declaradas no env passam.
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', TENANT_HEADER, REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    maxAge: 86_400,
  });

  // `X-Forwarded-For` do proxy — necessário para o rate limit por IP funcionar.
  app.set('trust proxy', 1);

  const swaggerConfig = SWAGGER_TAGS.reduce(
    (builder, [name, description]) => builder.addTag(name, description),
    new DocumentBuilder()
      .setTitle('BarberVP API')
      .setDescription(
        'SaaS multi-tenant de gestão de barbearias. Erros seguem `{ code, message, details? }`.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addGlobalParameters({
        name: TENANT_HEADER,
        in: 'header',
        required: false,
        description: 'Slug da barbearia — obrigatório nas rotas públicas por slug.',
        schema: { type: 'string' },
      }),
  ).build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig), {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`API em http://localhost:${config.port}/${config.prefix}`);
  logger.log(`Swagger em http://localhost:${config.port}/api/docs`);
}

void bootstrap();
