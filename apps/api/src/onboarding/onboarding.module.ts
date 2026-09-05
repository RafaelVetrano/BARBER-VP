import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { CepService } from './cep.service';
import { CitiesService } from './cities.service';

@Module({
  imports: [TenantsModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, CepService, CitiesService],
})
export class OnboardingModule {}
