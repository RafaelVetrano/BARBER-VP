import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AccountPayableItem,
  AccountPayableListResponse,
  AccountReceivableItem,
  AccountReceivableListResponse,
  BankAccountItem,
  CashFlowResponse,
  CashRegisterStatusResponse,
} from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { AuthPrincipal, RequestContext } from '../common/types/request-context';
import { FinanceService } from './finance.service';
import {
  AccountListQueryDto,
  CashFlowQueryDto,
  CloseCashRegisterDto,
  CreateAccountPayableDto,
  CreateAccountReceivableDto,
  OpenCashRegisterDto,
  UpsertBankAccountDto,
} from './dto/finance.dto';

/** Financeiro — Caixa é liberado em todo plano; o resto atrás de `contasPagarReceber` (Profissional+). */
@ApiTags('finance')
@ApiBearerAuth('access-token')
@Controller('finance')
@Roles('OWNER', 'MANAGER')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // ── Caixa ────────────────────────────────────────────────────────────────

  @Get('cash-register')
  @ApiOperation({ summary: 'Status do caixa (aberto/fechado)' })
  async cashStatus(@CurrentTenant('id') tenantId: string): Promise<CashRegisterStatusResponse> {
    return this.finance.cashStatus(tenantId);
  }

  @Post('cash-register/open')
  @ApiOperation({ summary: 'Abre o caixa com saldo inicial' })
  async openCash(
    @Body() dto: OpenCashRegisterDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<CashRegisterStatusResponse> {
    return this.finance.openCash(tenantId, dto, principal.id, request);
  }

  @Post('cash-register/close')
  @ApiOperation({ summary: 'Fecha o caixa com conferência' })
  async closeCash(
    @Body() dto: CloseCashRegisterDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<CashRegisterStatusResponse> {
    return this.finance.closeCash(tenantId, dto, principal.id, request);
  }

  // ── Contas a pagar ───────────────────────────────────────────────────────

  @Get('payables')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Lista contas a pagar' })
  async listPayable(
    @Query() query: AccountListQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<AccountPayableListResponse> {
    return this.finance.listPayable(tenantId, query);
  }

  @Post('payables')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Cria conta a pagar' })
  async createPayable(
    @Body() dto: CreateAccountPayableDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<AccountPayableItem> {
    return this.finance.createPayable(tenantId, dto, principal.id, request);
  }

  @Patch('payables/:id/pay')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Marca conta a pagar como paga' })
  async payPayable(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<AccountPayableItem> {
    return this.finance.markPayablePaid(tenantId, id, principal.id, request);
  }

  // ── Contas a receber ─────────────────────────────────────────────────────

  @Get('receivables')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Lista contas a receber' })
  async listReceivable(
    @Query() query: AccountListQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<AccountReceivableListResponse> {
    return this.finance.listReceivable(tenantId, query);
  }

  @Post('receivables')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Cria conta a receber' })
  async createReceivable(
    @Body() dto: CreateAccountReceivableDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<AccountReceivableItem> {
    return this.finance.createReceivable(tenantId, dto, principal.id, request);
  }

  @Patch('receivables/:id/receive')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Marca conta a receber como recebida' })
  async receiveReceivable(
    @Param('id') id: string,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<AccountReceivableItem> {
    return this.finance.markReceivableReceived(tenantId, id, principal.id, request);
  }

  // ── Contas bancárias ─────────────────────────────────────────────────────

  @Get('bank-accounts')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Lista contas bancárias' })
  async listBankAccounts(@CurrentTenant('id') tenantId: string): Promise<BankAccountItem[]> {
    return this.finance.listBankAccounts(tenantId);
  }

  @Post('bank-accounts')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Cria conta bancária' })
  async createBankAccount(
    @Body() dto: UpsertBankAccountDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<BankAccountItem> {
    return this.finance.upsertBankAccount(tenantId, undefined, dto, principal.id, request);
  }

  @Patch('bank-accounts/:id')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Atualiza conta bancária' })
  async updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpsertBankAccountDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser() principal: AuthPrincipal,
    @Req() request: RequestContext,
  ): Promise<BankAccountItem> {
    return this.finance.upsertBankAccount(tenantId, id, dto, principal.id, request);
  }

  // ── Fluxo de caixa ───────────────────────────────────────────────────────

  @Get('cash-flow')
  @RequireFeature('contasPagarReceber')
  @ApiOperation({ summary: 'Fluxo de caixa mensal (entradas vs. saídas)' })
  async cashFlow(
    @Query() query: CashFlowQueryDto,
    @CurrentTenant('id') tenantId: string,
  ): Promise<CashFlowResponse> {
    return this.finance.cashFlow(tenantId, query.months);
  }
}
