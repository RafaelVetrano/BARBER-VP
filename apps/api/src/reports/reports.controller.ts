import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ReportsAdvancedResponse, ReportsSummaryResponse } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { ReportsService } from './reports.service';
import { ReportPeriodQueryDto } from './dto/reports.dto';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller('reports')
@Roles('OWNER', 'MANAGER')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Faturamento, ticket médio e distribuição por forma de pagamento' })
  async summary(
    @Query() query: ReportPeriodQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<ReportsSummaryResponse> {
    return this.reports.summary(tenantId, query);
  }

  @Get('advanced')
  @RequireFeature('relatoriosAvancados')
  @ApiOperation({ summary: 'Faturamento por barbeiro/serviço/dia, ocupação, no-show e taxa de retorno' })
  async advanced(
    @Query() query: ReportPeriodQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<ReportsAdvancedResponse> {
    return this.reports.advanced(tenantId, query);
  }
}
