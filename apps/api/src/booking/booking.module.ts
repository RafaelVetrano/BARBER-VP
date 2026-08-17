import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicBookingController } from './public-booking.controller';
import { PublicPageService } from './public-page.service';
import { AvailabilityService } from './availability.service';
import { CatalogService } from './catalog.service';
import { SubscriptionCoverageService } from './subscription-coverage.service';
import { AppointmentsService } from './appointments.service';
import { BookingNotificationsService } from './booking-notifications.service';
import { GuestRiskService } from './guest-risk.service';

/**
 * Booking público (fase 04).
 *
 * Importa `AuthModule` só pelo `OtpService` — o desafio de 6 dígitos do
 * agendamento de visitante é o mesmo do cadastro, com as mesmas defesas.
 *
 * Os serviços são exportados porque a agenda do dashboard (fase 06) marca
 * horário pelo MESMO motor: a regra de combo, a compatibilidade
 * barbeiro↔serviço e o anti double-booking não podem ter duas implementações.
 */
@Module({
  imports: [AuthModule],
  controllers: [PublicBookingController],
  providers: [
    PublicPageService,
    AvailabilityService,
    CatalogService,
    SubscriptionCoverageService,
    AppointmentsService,
    BookingNotificationsService,
    GuestRiskService,
  ],
  exports: [
    AvailabilityService,
    CatalogService,
    SubscriptionCoverageService,
    AppointmentsService,
    BookingNotificationsService,
  ],
})
export class BookingModule {}
