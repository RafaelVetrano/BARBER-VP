import { Module } from '@nestjs/common';
import { SlugService } from './slug.service';

/**
 * Utilitários de tenant compartilhados. Nesta fase, só o `SlugService` — usado
 * pelo registro (`AuthModule`) e pelo passo 3 do wizard (`OnboardingModule`),
 * que precisam da MESMA regra de slug.
 */
@Module({
  providers: [SlugService],
  exports: [SlugService],
})
export class TenantsModule {}
