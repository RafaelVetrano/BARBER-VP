import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminInvoiceListResponse, RunBillingCycleResult } from '@barbervp/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantOptional } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../../common/types/request-context';
import { AdminBillingService } from './admin-billing.service';
import { AdminInvoiceListQueryDto } from '../dto/admin.dto';

/** Billing das barbearias — só `SUPER_ADMIN`, fora do conceito de tenant. */
@ApiTags('admin-billing')
@ApiBearerAuth('access-token')
@Controller('admin/billing')
@Roles('SUPER_ADMIN')
@TenantOptional()
export class AdminBillingController {
  constructor(private readonly billing: AdminBillingService) {}

  @Get('invoices')
  @ApiOperation({ summary: 'Lista faturas de todos os tenants' })
  listInvoices(@Query() query: AdminInvoiceListQueryDto): Promise<AdminInvoiceListResponse> {
    return this.billing.listInvoices(query);
  }

  @Post('run-cycle')
  @ApiOperation({ summary: 'Roda o ciclo de cobrança simulado — gera fatura PENDING para quem venceu' })
  runCycle(@CurrentUser() principal: AuthPrincipal, @Req() request: RequestContext): Promise<RunBillingCycleResult> {
    return this.billing.runCycle(principal.id, request);
  }

  @Post('invoices/:id/approve')
  @ApiOperation({ summary: 'Aprova a fatura manualmente — avança o ciclo e zera as recusas' })
  async approve(
    @Param('id') id: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<{ approved: true }> {
    await this.billing.approveInvoice(id, principal.id, request);
    return { approved: true };
  }

  @Post('invoices/:id/reject')
  @ApiOperation({ summary: 'Recusa a fatura manualmente — testa o fluxo de inadimplência' })
  reject(
    @Param('id') id: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<{ suspended: boolean }> {
    return this.billing.rejectInvoice(id, principal.id, request);
  }
}
