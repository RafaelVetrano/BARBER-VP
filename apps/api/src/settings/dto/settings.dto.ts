import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { MyPageImageSlot } from '@barbervp/types';
import { TENANT_TIMEZONES } from '@barbervp/types';
import {
  IsArray,
  IsBoolean,
  IsIn,
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
  @Max(1_440)
  opensAt!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_440)
  closesAt!: number;

  @IsBoolean()
  closed!: boolean;

  /**
   * Almoço da CASA. Nulo os dois = não fecha. A coerência do par e a janela
   * são conferidas no serviço (mensagem por dia) e no banco (duas CHECKs).
   */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_440)
  lunchStart!: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_440)
  lunchEnd!: number | null;
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

  /** Só os fusos que o seletor da tela oferece (`TENANT_TIMEZONES`). */
  @ApiPropertyOptional({ enum: TENANT_TIMEZONES.map((tz) => tz.value) })
  @IsOptional()
  @IsIn(TENANT_TIMEZONES.map((tz) => tz.value))
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

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(10)
  bloquearFaltasQtd?: number;

  /**
   * Minutos. O seletor da tela oferece 30min–12h (`ANTECEDENCIA_OPTIONS`), mas
   * a validação é uma FAIXA, não a lista: um tenant antigo pode ter um valor
   * fora do menu e precisa continuar conseguindo salvar o resto da aba.
   */
  @ApiPropertyOptional({ minimum: 0, maximum: 10_080 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_080)
  antecedenciaMinima?: number;

  /** Horas. Mesma regra de faixa da antecedência. */
  @ApiPropertyOptional({ minimum: 0, maximum: 168 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(168)
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

/**
 * Slot de imagem única da página (`POST|DELETE /my-page/images/:slot`).
 *
 * Validado como DTO de parâmetro, e não como string solta, para que
 * `/my-page/images/qualquer-coisa` responda 400 e nunca chegue ao storage com
 * uma pasta inventada pelo cliente.
 */
export class MyPageImageSlotParam {
  @ApiProperty({ enum: ['logo', 'cover'] })
  @IsIn(['logo', 'cover'])
  slot!: MyPageImageSlot;
}

export class UpdateMyPageReviewDto {
  @ApiProperty({ description: '`true` publica a avaliação na página pública.' })
  @IsBoolean()
  published!: boolean;
}
