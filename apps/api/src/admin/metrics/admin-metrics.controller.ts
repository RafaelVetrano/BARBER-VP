import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminMetricsResponse } from '@barbervp/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantOptional } from '../../common/decorators/public.decorator';
import { AdminMetricsService } from './admin-metrics.service';

/** Métricas da plataforma — só `SUPER_ADMIN`, fora do conceito de tenant. */
@ApiTags('admin-metrics')
@ApiBearerAuth('access-token')
@Controller('admin/metrics')
@Roles('SUPER_ADMIN')
@TenantOptional()
export class AdminMetricsController {
  constructor(private readonly metrics: AdminMetricsService) {}

  @Get()
  @ApiOperation({ summary: 'MRR, tenants ativos por plano, churn do mês, novos tenants' })
  summary(): Promise<AdminMetricsResponse> {
    return this.metrics.summary();
  }
}
