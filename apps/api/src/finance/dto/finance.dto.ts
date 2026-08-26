import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccountRecurrence, AccountStatus, PaymentMethod } from '@prisma/client';
import {
  ACCOUNT_PAYABLE_CATEGORIES,
  ACCOUNT_RECEIVABLE_CATEGORIES,
  BANK_ACCOUNT_METHODS,
  CASH_ENTRY_CATEGORIES,
  CASH_EXIT_CATEGORIES,
} from '@barbervp/types';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Teto de parcelas — 5 anos de mensalidade. Acima disso é dedo escorregado. */
const MAX_INSTALLMENTS = 60;

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

/**
 * "+ Entrada avulsa" e "+ Saída/Sangria". A categoria é validada contra a
 * lista da direção correspondente: uma "Sangria" positiva não existe.
 */
export class CreateCashMovementDto {
  @ApiProperty({ enum: ['IN', 'OUT'] })
  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amountCents!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  description!: string;

  @ApiProperty({ enum: [...CASH_ENTRY_CATEGORIES, ...CASH_EXIT_CATEGORIES] })
  @IsIn([...CASH_ENTRY_CATEGORIES, ...CASH_EXIT_CATEGORIES])
  category!: string;

  @ApiProperty({ enum: BANK_ACCOUNT_METHODS })
  @IsIn(BANK_ACCOUNT_METHODS)
  method!: PaymentMethod;
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

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_INSTALLMENTS, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(MAX_INSTALLMENTS)
  installments?: number;

  @ApiPropertyOptional({ enum: AccountRecurrence })
  @IsOptional()
  @IsEnum(AccountRecurrence)
  recurrence?: AccountRecurrence | null;

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

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_INSTALLMENTS, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(MAX_INSTALLMENTS)
  installments?: number;

  @ApiPropertyOptional({ enum: AccountRecurrence })
  @IsOptional()
  @IsEnum(AccountRecurrence)
  recurrence?: AccountRecurrence | null;

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
  @MaxLength(60)
  name!: string;

  /** Texto livre exibido sob o nome do card ("Conta bancária", "Caixa físico"…). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string | null;

  @ApiPropertyOptional({ enum: BANK_ACCOUNT_METHODS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(BANK_ACCOUNT_METHODS, { each: true })
  acceptedMethods?: PaymentMethod[];

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
  @Max(24)
  months?: number;
}
