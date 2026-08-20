import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsPositive, IsString, Matches, Min, MinLength } from 'class-validator';
import { OutboxStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class UpsertPlanDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Código deve ser minúsculo, só letras/números/hífen.' })
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents!: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  tier!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxBarbers?: number | null;

  /** `{ contasPagarReceber: true, vales: false, ... }` — as 10 chaves de `FEATURE_KEYS`, nenhuma nova. */
  @IsObject()
  features!: Record<string, boolean>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class AdminTenantListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;
}

export class ChangeTenantPlanDto {
  @IsString()
  planId!: string;
}

export class AdminInvoiceListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class AdminOutboxQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['notification', 'mail'] })
  @IsOptional()
  @IsIn(['notification', 'mail'])
  kind?: 'notification' | 'mail';

  @ApiPropertyOptional({ enum: OutboxStatus })
  @IsOptional()
  @IsEnum(OutboxStatus)
  status?: OutboxStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;
}
