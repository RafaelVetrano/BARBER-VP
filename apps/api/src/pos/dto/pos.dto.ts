import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DiscountType, OrderItemKind, OrderStatus, PaymentMethod } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class OrderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barberId?: string;
}

class WalkInDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(8)
  phone!: string;
}

export class OpenOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string | null;

  @ApiPropertyOptional({ type: WalkInDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WalkInDto)
  walkIn?: WalkInDto | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barberId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentId?: string | null;
}

export class AddOrderItemDto {
  @ApiPropertyOptional({ enum: OrderItemKind })
  @IsEnum(OrderItemKind)
  kind!: OrderItemKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barberId?: string | null;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity?: number;
}

export class UpdateOrderItemDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity!: number;
}

export class ApplyOrderDiscountDto {
  @ApiPropertyOptional({ enum: DiscountType, nullable: true })
  @IsIn([...Object.values(DiscountType), null])
  discountType!: DiscountType | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountValue!: number;
}

export class RedeemOrderLoyaltyDto {
  @IsBoolean()
  useLoyalty!: boolean;
}

class OrderPaymentSplitDto {
  @IsEnum(PaymentMethod)
  @IsIn([PaymentMethod.CASH, PaymentMethod.DEBIT, PaymentMethod.CREDIT, PaymentMethod.PIX])
  method!: PaymentMethod;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amountCents!: number;
}

export class CloseOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentSplitDto)
  payments!: OrderPaymentSplitDto[];
}

export class ReopenOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
