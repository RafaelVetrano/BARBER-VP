import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PRICE_CALC_LIMITS } from '@barbervp/types';

export class PriceCalcFixedCostDto {
  @ApiProperty()
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiProperty({ minimum: 0, description: 'Em centavos' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  amountCents!: number;
}

/**
 * Corpo do `PUT /price-calculator`. Os limites são os mesmos dos sliders do
 * protótipo — e ficam aqui, não só no `<input type="range">`: o gate de plano
 * é server-side, o intervalo do dado também precisa ser (regra 3).
 */
export class UpdatePriceCalculatorDto {
  @ApiPropertyOptional({ type: [PriceCalcFixedCostDto] })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => PriceCalcFixedCostDto)
  fixedCosts!: PriceCalcFixedCostDto[];

  @ApiProperty({ minimum: 0, description: 'Em centavos' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  custoVariavelCents!: number;

  @ApiProperty({ minimum: 0, maximum: 10_000, description: 'Basis points' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  comissaoMediaBps!: number;

  @ApiProperty({
    minimum: PRICE_CALC_LIMITS.atendimentosMin,
    maximum: PRICE_CALC_LIMITS.atendimentosMax,
  })
  @Type(() => Number)
  @IsInt()
  @Min(PRICE_CALC_LIMITS.atendimentosMin)
  @Max(PRICE_CALC_LIMITS.atendimentosMax)
  atendimentosMes!: number;

  @ApiProperty({ minimum: PRICE_CALC_LIMITS.margemMinBps, maximum: PRICE_CALC_LIMITS.margemMaxBps })
  @Type(() => Number)
  @IsInt()
  @Min(PRICE_CALC_LIMITS.margemMinBps)
  @Max(PRICE_CALC_LIMITS.margemMaxBps)
  margemBps!: number;

  @ApiProperty({ minimum: 0, description: 'Em centavos' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  precoPraticadoCents!: number;
}
