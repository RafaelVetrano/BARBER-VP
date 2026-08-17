import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { CepService } from './cep.service';

@Module({
  imports: [TenantsModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, CepService],
})
export class OnboardingModule {}
