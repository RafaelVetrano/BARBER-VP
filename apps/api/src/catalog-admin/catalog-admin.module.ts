import { Module } from '@nestjs/common';
import { ServicesAdminController } from './services-admin.controller';
import { ServicesAdminService } from './services-admin.service';
import { ProductsAdminController } from './products-admin.controller';
import { ProductsAdminService } from './products-admin.service';
import { PriceCalculatorController } from './price-calculator.controller';
import { PriceCalculatorService } from './price-calculator.service';

/**
 * CRUD administrativo de `Service`/`Product` e a calculadora de preço — as
 * três sub-abas da tela "Serviços & Produtos".
 */
@Module({
  controllers: [ServicesAdminController, ProductsAdminController, PriceCalculatorController],
  providers: [ServicesAdminService, ProductsAdminService, PriceCalculatorService],
})
export class CatalogAdminModule {}
