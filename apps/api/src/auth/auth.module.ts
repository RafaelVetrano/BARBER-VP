import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantsModule } from '../tenants/tenants.module';
import { EstablishmentAuthController } from './establishment-auth.controller';
import { EstablishmentAuthService } from './establishment-auth.service';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { PasswordService } from './crypto/password.service';
import { AccessTokenService } from './tokens/access-token.service';
import { SessionService } from './tokens/session.service';
import { RefreshCookieService } from './tokens/refresh-cookie.service';
import { OtpService } from './otp/otp.service';

/**
 * Autenticação das duas audiências.
 *
 * Exporta `AccessTokenService` e `SessionService` porque o `JwtAuthGuard`
 * (registrado como `APP_GUARD` global no `app.module.ts`) depende deles.
 *
 * O `JwtModule` entra sem segredo global: cada chamada de `sign`/`verify` passa
 * o segredo explicitamente, para não haver dúvida sobre qual chave assinou o quê.
 */
@Module({
  imports: [JwtModule.register({}), TenantsModule],
  controllers: [EstablishmentAuthController, ClientAuthController],
  providers: [
    EstablishmentAuthService,
    ClientAuthService,
    PasswordService,
    AccessTokenService,
    SessionService,
    RefreshCookieService,
    OtpService,
  ],
  // `OtpService` sai daqui para o booking público: o agendamento de visitante
  // em situação de risco usa o MESMO desafio de 6 dígitos do cadastro, com as
  // mesmas defesas (tentativas, cooldown, teto por destino).
  // `EstablishmentAuthService`/`RefreshCookieService` saem daqui para o convite
  // de equipe (fase 06): o aceite emite sessão e grava o cookie pelo MESMO
  // caminho do login/registro.
  exports: [
    AccessTokenService,
    SessionService,
    PasswordService,
    OtpService,
    EstablishmentAuthService,
    RefreshCookieService,
  ],
})
export class AuthModule {}
