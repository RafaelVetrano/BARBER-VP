import { Module } from '@nestjs/common';
import { WhatsappConfigController } from './whatsapp-config.controller';
import { WhatsappConfigService } from './whatsapp-config.service';

@Module({
  controllers: [WhatsappConfigController],
  providers: [WhatsappConfigService],
})
export class WhatsappConfigModule {}
