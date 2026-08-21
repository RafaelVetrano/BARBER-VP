import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  DashboardOverviewResponse,
  DashboardShellResponse,
  GlobalSearchResponse,
  NotificationsResponse,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal } from '../common/types/request-context';
import { StaffScopeService } from '../staff-agenda/staff-scope.service';
import { DashboardOverviewService } from './dashboard-overview.service';
import { DashboardShellService } from './dashboard-shell.service';
import { GlobalSearchService } from './global-search.service';
import { NotificationsService } from './notifications.service';
import { DashboardOverviewQueryDto, GlobalSearchQueryDto } from './dto/dashboard.dto';

/**
 * Tela `/app` (Dashboard) e a casca do painel.
 *
 * `BARBER` entra aqui pelo mesmo motivo da agenda interna: é o MESMO endpoint
 * do `Dashboard` e do `DashboardFuncionario` — quem recorta é o
 * `StaffScopeService`, dentro do serviço, nunca uma rota paralela.
 */
@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
@Roles('OWNER', 'MANAGER', 'BARBER')
export class DashboardController {
  constructor(
    private readonly shell: DashboardShellService,
    private readonly overview: DashboardOverviewService,
    private readonly scopes: StaffScopeService,
  ) {}

  @Get('shell')
  @ApiOperation({ summary: 'Plano, features, teste e unidades — a casca de todas as telas' })
  getShell(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<DashboardShellResponse> {
    return this.shell.shell(tenantId, principal);
  }

  @Get('overview')
  @ApiOperation({ summary: 'KPIs, gráficos, ranking, próximos atendimentos e alertas' })
  async getOverview(
    @Query() query: DashboardOverviewQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<DashboardOverviewResponse> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.overview.overview(tenantId, scope, query.period ?? 'mes');
  }
}

/** Busca global da topbar — rota própria porque não é dado de dashboard. */
@ApiTags('search')
@ApiBearerAuth('access-token')
@Controller('search')
@Roles('OWNER', 'MANAGER', 'BARBER')
export class GlobalSearchController {
  constructor(
    private readonly search: GlobalSearchService,
    private readonly scopes: StaffScopeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Busca clientes, agendamentos e serviços (Ctrl+K)' })
  async find(
    @Query() query: GlobalSearchQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<GlobalSearchResponse> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.search.search(tenantId, scope, query.q);
  }
}

/** Sino da topbar. */
@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@Roles('OWNER', 'MANAGER', 'BARBER')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly scopes: StaffScopeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Pendências do dia — confirmações, contas, caixa e estoque' })
  async list(
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<NotificationsResponse> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.notifications.list(tenantId, scope);
  }
}
