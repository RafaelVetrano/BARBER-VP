import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { SERVICE_COLORS } from '@barbervp/types';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ServiceListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsBooleanString()
  active?: string;
}

export class UpsertServiceDto {
  @ApiPropertyOptional()
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string | null;

  @ApiPropertyOptional({ minimum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  durationMin!: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Em centavos' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 60)
  category?: string | null;

  // A cor não é texto livre: são as 6 do design system. Aceitar um hex
  // qualquer deixaria o dono pintar um serviço de preto sobre fundo preto na
  // agenda, e não há tela para desfazer isso.
  @ApiPropertyOptional({ enum: SERVICE_COLORS })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(SERVICE_COLORS as unknown as string[])
  color?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 10_000, description: 'Basis points; null = usa a regra do barbeiro' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  commissionBps?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  active?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  barberIds?: string[];
}

export class ProductListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsBooleanString()
  active?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsBooleanString()
  lowStock?: string;
}

export class UpsertProductDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 40)
  sku?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 60)
  category?: string | null;

  @ApiPropertyOptional({ minimum: 0, description: 'Em centavos' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Em centavos' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  costCents?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estoqueMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  active?: boolean;
}

/** "Repor estoque" — soma unidades ao que já existe, nunca substitui. */
export class RestockProductDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity!: number;
}
