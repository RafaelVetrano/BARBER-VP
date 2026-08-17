import { Module } from '@nestjs/common';
import { ClientAccountController } from './client-account.controller';
import { ClientAppointmentsService } from './client-appointments.service';
import { ClientSubscriptionService } from './client-subscription.service';
import { SubscriptionRenewalService } from './subscription-renewal.service';

/**
 * Área do cliente (fase 05) — agendamentos e assinatura sob `/public/:slug/account`.
 *
 * `AdaptersModule` é `@Global()` (`PAYMENT_ADAPTER` chega sem import); não
 * depende de `BookingModule` — só reusa `isWithinChangeWindow`, uma função
 * pura exportada de `booking/appointments.service.ts`, não o serviço inteiro.
 * O cancelamento/remarcação em si continuam sendo a MESMA rota da fase 04
 * (`/public/:slug/appointments/:code/cancel`), chamada pelo cliente logado com
 * o `bookingCode` que esta lista devolve.
 */
@Module({
  controllers: [ClientAccountController],
  providers: [ClientAppointmentsService, ClientSubscriptionService, SubscriptionRenewalService],
  exports: [ClientSubscriptionService, SubscriptionRenewalService],
})
export class ClientAccountModule {}
