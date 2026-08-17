import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  barberIds?: string[];
}

export class CommissionPeriodQueryDto {
  /** `YYYY-MM`. */
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;
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
