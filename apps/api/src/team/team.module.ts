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
})
export class TeamModule {}
