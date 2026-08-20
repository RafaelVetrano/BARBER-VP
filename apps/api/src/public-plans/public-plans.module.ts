import { Module } from '@nestjs/common';
import { PublicPlansController } from './public-plans.controller';
import { PublicPlansService } from './public-plans.service';

/** Landing de vendas (fase 10) — leitura pública dos planos do SaaS. */
@Module({
  controllers: [PublicPlansController],
  providers: [PublicPlansService],
})
export class PublicPlansModule {}
