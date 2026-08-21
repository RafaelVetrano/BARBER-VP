import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppConfigModule } from './config/config.module';
import { CONFIG, type AppConfig } from './config/configuration';
import { LoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AdaptersModule } from './adapters/adapters.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PublicPlansModule } from './public-plans/public-plans.module';
import { BookingModule } from './booking/booking.module';
import { ClientAccountModule } from './client-account/client-account.module';
import { ClientsModule } from './clients/clients.module';
import { CatalogAdminModule } from './catalog-admin/catalog-admin.module';
import { TeamModule } from './team/team.module';
import { StaffAgendaModule } from './staff-agenda/staff-agenda.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PosModule } from './pos/pos.module';
import { CommissionsModule } from './commissions/commissions.module';
import { FinanceModule } from './finance/finance.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { WhatsappConfigModule } from './whatsapp-config/whatsapp-config.module';
import { AssistantModule } from './assistant/assistant.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { AdminModule } from './admin/admin.module';
import { QueueModule } from './queue/queue.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { FeatureGuard } from './common/guards/feature.guard';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    RedisModule,
    AdaptersModule,
    AuditModule,
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [CONFIG],
      // Limite global e permissivo — os `@Throttle` de login, registro e OTP
      // são bem mais apertados, no próprio handler.
      //
      // A contagem mora no REDIS desde a fase 09 (era memória do processo, uma
      // dívida da fase 03): com N réplicas atrás do balanceador, cada uma
      // contava o seu, e o teto real de um ataque de força bruta era N × o
      // limite configurado. Compartilhando o storage, o limite volta a
      // significar o que diz.
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: config.throttle.ttl * 1_000, limit: config.throttle.limit }],
        // `undefined` deixa o throttler cair no storage em memória dele.
        storage:
          config.throttle.storage === 'redis'
            ? new ThrottlerStorageRedisService(config.redisUrl)
            : undefined,
      }),
    }),
    HealthModule,
    TenantsModule,
    AuthModule,
    OnboardingModule,
    // ANTES do `BookingModule`, e não por estilo: aquele é
    // `@Controller('public/:slug')` com `@Get()` na raiz, então
    // `/public/saas-plans` casaria como `slug = "saas-plans"`. Express casa na
    // ordem de registro — quem chega primeiro atende.
    PublicPlansModule,
    BookingModule,
    ClientAccountModule,
    ClientsModule,
    CatalogAdminModule,
    TeamModule,
    StaffAgendaModule,
    DashboardModule,
    PosModule,
    CommissionsModule,
    FinanceModule,
    LoyaltyModule,
    WhatsappConfigModule,
    AssistantModule,
    ReportsModule,
    SettingsModule,
    AdminModule,
    QueueModule.register(),
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Ordem importa e é esta: throttle → autenticação → tenant → papéis → feature.
    // O `JwtAuthGuard` precede o `TenantGuard` porque é ele quem preenche
    // `request.principal`, de onde o tenant ativo é lido. `FeatureGuard` vem
    // por último porque só faz sentido depois que tenant e papel já passaram.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
})
export class AppModule {}
