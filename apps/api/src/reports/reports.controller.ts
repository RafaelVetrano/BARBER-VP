import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { ReportsAdvancedResponse, ReportsSummaryResponse } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal } from '../common/types/request-context';
import { StaffScopeService } from '../staff-agenda/staff-scope.service';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports-export.service';
import { ReportPeriodQueryDto } from './dto/reports.dto';

/**
 * Relatórios.
 *
 * `BARBER` entra: o `DashboardFuncionario.dc.html` tem `relatorios` no nav
 * (l.1617) e uma aba inteira (l.667–775) com a produção dele. O recorte é do
 * servidor (`StaffScope`), então o filtro de barbeiros da barra não é um
 * caminho para os números de um colega.
 *
 * O gate de plano cobre EXATAMENTE os blocos que o protótipo embaça
 * (`relatoriosLocked`, l.6915): serviço, retorno, heatmap, faltas e ticket
 * médio — mais os dois botões de exportação, que ficam translúcidos na barra.
 * Faturamento por período, por barbeiro e por forma de pagamento NÃO têm
 * cadeado e por isso vivem em `/summary`, aberto a todo plano.
 */
@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller('reports')
@Roles('OWNER', 'MANAGER', 'BARBER')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exports: ReportsExportService,
    private readonly scopes: StaffScopeService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Faturamento do período, por barbeiro e por forma de pagamento' })
  async summary(
    @Query() query: ReportPeriodQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<ReportsSummaryResponse> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.reports.summary(tenantId, query, scope);
  }

  @Get('advanced')
  @RequireFeature('relatoriosAvancados')
  @ApiOperation({ summary: 'Serviço, taxa de retorno, heatmap, faltas por mês e ticket médio' })
  async advanced(
    @Query() query: ReportPeriodQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<ReportsAdvancedResponse> {
    const scope = await this.scopes.resolve(tenantId, principal);
    return this.reports.advanced(tenantId, query, scope);
  }

  @Get('export.csv')
  @RequireFeature('relatoriosAvancados')
  @Header('Cache-Control', 'no-store')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: '"Exportar CSV" — o período inteiro em uma planilha' })
  async exportCsv(
    @Query() query: ReportPeriodQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Res() response: Response,
  ): Promise<void> {
    const scope = await this.scopes.resolve(tenantId, principal);
    const [summary, advanced] = await Promise.all([
      this.reports.summary(tenantId, query, scope),
      this.reports.advanced(tenantId, query, scope),
    ]);
    const file = await this.exports.csv(tenantId, summary, advanced);
    send(response, file, 'text/csv; charset=utf-8');
  }

  @Get('export.pdf')
  @RequireFeature('relatoriosAvancados')
  @Header('Cache-Control', 'no-store')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: '"Exportar PDF" — o período inteiro em um documento' })
  async exportPdf(
    @Query() query: ReportPeriodQueryDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Res() response: Response,
  ): Promise<void> {
    const scope = await this.scopes.resolve(tenantId, principal);
    const [summary, advanced] = await Promise.all([
      this.reports.summary(tenantId, query, scope),
      this.reports.advanced(tenantId, query, scope),
    ]);
    const file = await this.exports.pdf(tenantId, summary, advanced);
    send(response, file, 'application/pdf');
  }
}

function send(
  response: Response,
  file: { filename: string; body: Buffer },
  contentType: string,
): void {
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  response.setHeader('Content-Length', file.body.length);
  response.end(file.body);
}
