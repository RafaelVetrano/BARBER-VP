import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { StaffAgendaModule } from '../staff-agenda/staff-agenda.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Comandas (POS). Importa `BookingModule` pelo `SubscriptionCoverageService`
 * (mesmo débito atômico do agendamento) e `CommissionsModule` pelo
 * `CommissionCalcService` — o fechamento gera `CommissionEntry` na MESMA
 * transação, não por uma chamada HTTP separada.
 */
@Module({
  imports: [BookingModule, StaffAgendaModule, CommissionsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class PosModule {}
