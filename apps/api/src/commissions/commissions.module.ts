import { Module } from '@nestjs/common';
import { StaffAgendaModule } from '../staff-agenda/staff-agenda.module';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { CommissionCalcService } from './commission-calc.service';

/**
 * `CommissionCalcService` é exportado porque o fechamento de comanda (fase
 * 07 → POS) precisa gravar `CommissionEntry` DENTRO da própria transação de
 * fechamento — não dá pra chamar um endpoint HTTP de dentro de outra
 * transação, então a peça de cálculo vira serviço compartilhado.
 */
@Module({
  imports: [StaffAgendaModule],
  controllers: [CommissionsController],
  providers: [CommissionsService, CommissionCalcService],
  exports: [CommissionCalcService],
})
export class CommissionsModule {}
