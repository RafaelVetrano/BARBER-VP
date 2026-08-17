import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { StaffAgendaController } from './staff-agenda.controller';
import { StaffAppointmentsService } from './staff-appointments.service';
import { StaffScopeService } from './staff-scope.service';

/**
 * Agenda interna — importa `BookingModule` pelo `AvailabilityService`/
 * `CatalogService`/`SubscriptionCoverageService` que ele já exporta para isto
 * (ver o comentário em `booking.module.ts`): é o MESMO motor da fase 04.
 */
@Module({
  imports: [BookingModule],
  controllers: [StaffAgendaController],
  providers: [StaffAppointmentsService, StaffScopeService],
})
export class StaffAgendaModule {}
