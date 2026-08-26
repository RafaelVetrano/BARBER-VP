import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class UpdateLoyaltyProgramDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  gastoPorPonto?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  pontosParaDesconto?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  valorDesconto?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  expiracaoMeses?: number | null;
}

export class UpsertClientPlanItemDto {
  @IsString()
  serviceId!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quota!: number;
}

export class UpsertClientPlanDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  priceCents!: number;

  /** O `select` do modal tem 28 opções (protótipo l.3355) — o dia 29+ não existe em fevereiro. */
  @ApiPropertyOptional({ minimum: 1, maximum: 28, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  billingDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertClientPlanItemDto)
  items!: UpsertClientPlanItemDto[];
}
