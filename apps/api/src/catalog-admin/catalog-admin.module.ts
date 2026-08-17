import { Module } from '@nestjs/common';
import { ServicesAdminController } from './services-admin.controller';
import { ServicesAdminService } from './services-admin.service';
import { ProductsAdminController } from './products-admin.controller';
import { ProductsAdminService } from './products-admin.service';

/** CRUD administrativo de `Service`/`Product` — tela "Serviços & Produtos". */
@Module({
  controllers: [ServicesAdminController, ProductsAdminController],
  providers: [ServicesAdminService, ProductsAdminService],
})
export class CatalogAdminModule {}
