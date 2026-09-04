import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BarbersController } from './barbers.controller';
import { BarbersService } from './barbers.service';
import { InvitesController } from './invites.controller';
import { InviteAcceptController } from './invite-accept.controller';
import { InvitesService } from './invites.service';
import { PlanLimitsService } from './plan-limits.service';

/**
 * Equipe — barbeiros, escala semanal, exceções e convite de funcionário.
 *
 * Importa `AuthModule` por `PasswordService` (hash da senha do convite
 * aceito) e `EstablishmentAuthService` (emite sessão no mesmo formato do
 * login ao aceitar).
 */
@Module({
  imports: [AuthModule],
  controllers: [BarbersController, InvitesController, InviteAcceptController],
  providers: [BarbersService, InvitesService, PlanLimitsService],
  // Configurações usa o mesmo `maxBarbeiros` na troca de plano — a regra do
  // teto mora aqui, e não duplicada lá (agentes 24 e 26 compartilham).
  exports: [PlanLimitsService],
})
export class TeamModule {}
