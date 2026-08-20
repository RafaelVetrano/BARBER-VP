import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminPlansController } from './plans/admin-plans.controller';
import { AdminPlansService } from './plans/admin-plans.service';
import { AdminTenantsController } from './tenants/admin-tenants.controller';
import { AdminTenantsService } from './tenants/admin-tenants.service';
import { AdminBillingController } from './billing/admin-billing.controller';
import { AdminBillingService } from './billing/admin-billing.service';
import { AdminMetricsController } from './metrics/admin-metrics.controller';
import { AdminMetricsService } from './metrics/admin-metrics.service';
import { AdminOutboxController } from './outbox/admin-outbox.controller';
import { AdminOutboxService } from './outbox/admin-outbox.service';

/**
 * Super Admin (fase 08) — `apps/admin`. Importa `AuthModule` só pelo
 * `EstablishmentAuthService.issueSessionForUser`, que a impersonação reusa
 * (mesmo caminho do aceite de convite de equipe, fase 06) em vez de duplicar
 * a lógica de emissão de sessão.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    AdminPlansController,
    AdminTenantsController,
    AdminBillingController,
    AdminMetricsController,
    AdminOutboxController,
  ],
  providers: [
    AdminPlansService,
    AdminTenantsService,
    AdminBillingService,
    AdminMetricsService,
    AdminOutboxService,
  ],
  // `AdminBillingService` sai daqui para o job diário da fila (fase 09) poder
  // chamar `runCycle()` — o MESMO método do botão "Rodar ciclo" da tela.
  exports: [AdminBillingService],
})
export class AdminModule {}
