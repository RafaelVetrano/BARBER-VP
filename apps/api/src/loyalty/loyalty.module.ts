import { Module } from '@nestjs/common';
import { ClientAccountModule } from '../client-account/client-account.module';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

/**
 * `ClientAccountModule` entra porque pausar/retomar/cancelar do painel são as
 * MESMAS operações que o cliente dispara na `MinhaConta` — reusar o serviço é
 * o que impede as duas pontas de divergirem na regra do ciclo.
 */
@Module({
  imports: [ClientAccountModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
})
export class LoyaltyModule {}
