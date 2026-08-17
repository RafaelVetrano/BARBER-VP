import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { StaffInviteListItem } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { InvitesService } from './invites.service';
import { CreateStaffInviteDto } from './dto/team.dto';

/** Convites de equipe — lado do dono/gerente que convida. */
@ApiTags('team')
@ApiBearerAuth('access-token')
@Controller('team/invites')
@Roles('OWNER', 'MANAGER')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista convites (pendentes, aceitos, revogados, expirados)' })
  list(@CurrentTenant('id') tenantId: string): Promise<StaffInviteListItem[]> {
    return this.invites.list(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Convida um novo barbeiro por e-mail' })
  create(
    @Body() dto: CreateStaffInviteDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<StaffInviteListItem> {
    return this.invites.create(tenantId, dto, principal, request);
  }

  @Post(':id/resend')
  @ApiOperation({ summary: 'Reenvia o convite com um novo link (o antigo perde a validade)' })
  resend(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<StaffInviteListItem> {
    return this.invites.resend(tenantId, id, principal, request);
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoga um convite pendente' })
  revoke(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<StaffInviteListItem> {
    return this.invites.revoke(tenantId, id, principal, request);
  }
}
