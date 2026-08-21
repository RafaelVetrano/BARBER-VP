import { Module } from '@nestjs/common';
import { StaffAgendaModule } from '../staff-agenda/staff-agenda.module';
import {
  DashboardController,
  GlobalSearchController,
  NotificationsController,
} from './dashboard.controller';
import { DashboardOverviewService } from './dashboard-overview.service';
import { DashboardShellService } from './dashboard-shell.service';
import { GlobalSearchService } from './global-search.service';
import { NotificationsService } from './notifications.service';

/**
 * Fase 13 — a tela `/app` inteira.
 *
 * Importa `StaffAgendaModule` só pelo `StaffScopeService` que ele exporta: o
 * recorte "BARBER só enxerga o próprio" é o MESMO da agenda, das comandas e
 * das comissões, e resolvê-lo de novo aqui seria uma segunda regra a
 * divergir da primeira.
 */
@Module({
  imports: [StaffAgendaModule],
  controllers: [DashboardController, GlobalSearchController, NotificationsController],
  providers: [
    DashboardShellService,
    DashboardOverviewService,
    GlobalSearchService,
    NotificationsService,
  ],
})
export class DashboardModule {}
