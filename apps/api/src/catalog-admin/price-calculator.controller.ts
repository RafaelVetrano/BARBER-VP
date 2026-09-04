import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PriceCalculatorState } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentTenant, CurrentUser } from '../common/decorators/current-tenant.decorator';
import type { RequestContext } from '../common/types/request-context';
import { PriceCalculatorService } from './price-calculator.service';
import { UpdatePriceCalculatorDto } from './dto/price-calculator.dto';

/**
 * Sub-aba "Calculadora de preço" do catálogo — plano **Avançado**.
 *
 * `@RequireFeature` no controller inteiro: o cadeado da aba (protótipo l.1728)
 * e o paywall (l.1836) são o espelho DESTE 403, nunca a barreira. Quem chamar
 * a rota com um Essencial na mão toma `FEATURE_NOT_IN_PLAN` igual.
 */
@ApiTags('catalog')
@ApiBearerAuth('access-token')
@Controller('price-calculator')
@Roles('OWNER', 'MANAGER')
@RequireFeature('calculadoraPreco')
export class PriceCalculatorController {
  constructor(private readonly calculator: PriceCalculatorService) {}

  @Get()
  @ApiOperation({ summary: 'Custos, parâmetros e números derivados da calculadora' })
  get(@CurrentTenant('id') tenantId: string): Promise<PriceCalculatorState> {
    return this.calculator.get(tenantId);
  }

  @Put()
  @ApiOperation({ summary: 'Grava custos e parâmetros e devolve os números recalculados' })
  update(
    @Body() dto: UpdatePriceCalculatorDto,
    @CurrentTenant('id') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Req() request: RequestContext,
  ): Promise<PriceCalculatorState> {
    return this.calculator.update(tenantId, dto, actorUserId, request);
  }
}
