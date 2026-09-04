import { Module } from '@nestjs/common';
import { MyProfileController } from './my-profile.controller';
import { MyProfileService } from './my-profile.service';

/**
 * A conta da PESSOA logada — a tela "Meu perfil" do menu do avatar.
 *
 * Fica fora de `SettingsModule` de propósito: aquele módulo é da BARBEARIA e
 * está inteiro sob `@Roles('OWNER','MANAGER')`. Este atende os três papéis.
 *
 * Sem `imports`: os três adapters de que o serviço precisa (mail, pagamento,
 * storage) vêm do `AdaptersModule`, que é `@Global()`.
 */
@Module({
  controllers: [MyProfileController],
  providers: [MyProfileService],
})
export class AccountModule {}
