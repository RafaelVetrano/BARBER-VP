import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CommissionRuleType } from '@prisma/client';

class CommissionTierInputDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  upToCents!: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  percentBps!: number;
}

export class UpsertCommissionRuleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(CommissionRuleType)
  type!: CommissionRuleType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  percentBps?: number | null;

  @ApiPropertyOptional({ type: [CommissionTierInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionTierInputDto)
  tiers?: CommissionTierInputDto[];

  /** Comissão sobre PRODUTOS — vale nos dois tipos de regra. */
  @ApiPropertyOptional({ description: 'Basis points (1000 = 10%).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  percentProdutosBps?: number;

  /** "Descontar vales automaticamente" do modal de regras. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deductVales?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  barberIds?: string[];
}

export class CommissionPeriodQueryDto {
  /** `WEEKLY` ou `MONTHLY` — o par "Semanal/Mensal" do protótipo. Padrão `MONTHLY`. */
  @ApiPropertyOptional({ enum: ['WEEKLY', 'MONTHLY'] })
  @IsOptional()
  @IsIn(['WEEKLY', 'MONTHLY'])
  type?: 'WEEKLY' | 'MONTHLY';

  /** Qualquer dia DENTRO do período (`YYYY-MM-DD`). Obrigatório em `WEEKLY`. */
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  anchor?: string;

  /** Atalho de `type=MONTHLY` (`YYYY-MM`). */
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}

/** `CommissionPeriodQueryDto` + o barbeiro do relatório (`modalPdfOpen`). */
export class CommissionReportQueryDto extends CommissionPeriodQueryDto {
  @IsString()
  barberId!: string;
}

export class ClosePeriodDto {
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;
}

export class CreateValeDto {
  @IsString()
  barberId!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amountCents!: number;

  /** `YYYY-MM-DD`. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;
}
