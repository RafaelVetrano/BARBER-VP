import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { MyPageController } from './my-page.controller';
import { MyPageService } from './my-page.service';

@Module({
  imports: [TenantsModule],
  controllers: [SettingsController, MyPageController],
  providers: [SettingsService, MyPageService],
})
export class SettingsModule {}
