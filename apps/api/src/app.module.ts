import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { BookingModule } from './booking/booking.module';
import { ClientAccountModule } from './client-account/client-account.module';
import { ClientsModule } from './clients/clients.module';
import { CatalogAdminModule } from './catalog-admin/catalog-admin.module';
import { TeamModule } from './team/team.module';
import { StaffAgendaModule } from './staff-agenda/staff-agenda.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './common/guards/roles.guard';

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
      useFactory: (config: AppConfig) => [
        { ttl: config.throttle.ttl * 1_000, limit: config.throttle.limit },
      ],
    }),
    HealthModule,
    TenantsModule,
    AuthModule,
    OnboardingModule,
    BookingModule,
    ClientAccountModule,
    ClientsModule,
    CatalogAdminModule,
    TeamModule,
    StaffAgendaModule,
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
    // Ordem importa e é esta: throttle → autenticação → tenant → papéis.
    // O `JwtAuthGuard` precede o `TenantGuard` porque é ele quem preenche
    // `request.principal`, de onde o tenant ativo é lido.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
