import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantInsightsService } from './assistant-insights.service';
import { AssistantService } from './assistant.service';

@Module({
  controllers: [AssistantController],
  providers: [AssistantService, AssistantInsightsService],
})
export class AssistantModule {}
