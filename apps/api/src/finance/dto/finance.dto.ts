import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsPositive, IsString, Matches, Min, MinLength } from 'class-validator';
import { AccountStatus } from '@prisma/client';
import { ACCOUNT_PAYABLE_CATEGORIES, ACCOUNT_RECEIVABLE_CATEGORIES } from '@barbervp/types';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class OpenCashRegisterDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  openingCents!: number;
}

export class CloseCashRegisterDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class AccountListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}

export class CreateAccountPayableDto {
  @IsString()
  @MinLength(2)
  description!: string;

  @IsIn(ACCOUNT_PAYABLE_CATEGORIES)
  category!: (typeof ACCOUNT_PAYABLE_CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplier?: string | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amountCents!: number;

  /** `YYYY-MM-DD`. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate!: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  installments?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreateAccountReceivableDto {
  @IsString()
  @MinLength(2)
  description!: string;

  @IsIn(ACCOUNT_RECEIVABLE_CATEGORIES)
  category!: (typeof ACCOUNT_RECEIVABLE_CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customer?: string | null;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amountCents!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate!: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  installments?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpsertBankAccountDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bank?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agency?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  account?: string | null;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  balanceCents?: number;
}

export class CashFlowQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 24, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  months?: number;
}
