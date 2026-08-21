import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

class BusinessHourInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  opensAt!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  closesAt!: number;

  @IsBoolean()
  closed!: boolean;
}

export class UpdateBarbershopSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  document?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ type: [BusinessHourInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessHourInputDto)
  businessHours?: BusinessHourInputDto[];
}

export class UpsertUnitDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string | null;
}

export class ChangePlanDto {
  @IsString()
  planId!: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bloquearFaltasAtivo?: boolean;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  bloquearFaltasQtd?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  antecedenciaMinima?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cancelamentoHoras?: number;

  @ApiPropertyOptional({
    minimum: 0,
    nullable: true,
    description: 'Meta de faturamento do mês em centavos. `null` limpa a meta.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyGoalCents?: number | null;
}

export class PriceCalculatorDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  custoCents!: number;

  @Type(() => Number)
  @IsPositive()
  margemPercent!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  custosFixosCents!: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  atendimentosMes!: number;

  @Type(() => Number)
  @Min(0)
  comissaoPercent!: number;
}

export class UpdateMyPageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sobre?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instagram?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showServices?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showReviews?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPhotos?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBusinessHours?: boolean;
}

export class AddTenantPhotoDto {
  @IsString()
  @MinLength(4)
  url!: string;
}
