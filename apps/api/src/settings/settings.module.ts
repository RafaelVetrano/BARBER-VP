import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { TeamModule } from '../team/team.module';
import { TenantsModule } from '../tenants/tenants.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { MyPageController } from './my-page.controller';
import { MyPageService } from './my-page.service';
import { InvoicePdfService } from './invoice-pdf.service';

/**
 * `BookingModule` entra pelo `PublicPageService`: o "Preview ao vivo" de Minha
 * Página serve o MESMO payload de `/{slug}`. Duas montagens do mesmo payload
 * dariam um preview que mente.
 */
@Module({
  imports: [TenantsModule, TeamModule, BookingModule],
  controllers: [SettingsController, MyPageController],
  providers: [SettingsService, MyPageService, InvoicePdfService],
})
export class SettingsModule {}
