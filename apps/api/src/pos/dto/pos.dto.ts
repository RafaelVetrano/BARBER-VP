import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DiscountType, OrderItemKind, OrderStatus, PaymentMethod } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class OrderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Só as fechadas do dia corrente no fuso da barbearia.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  closedToday?: boolean;

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

/**
 * Troca de cliente/barbeiro numa comanda aberta. Todo campo é opcional e
 * `undefined` significa "não mexe" — `null` em `barberId` é "tira o barbeiro".
 */
export class AssignOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ type: WalkInDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WalkInDto)
  walkIn?: WalkInDto;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  barberId?: string | null;
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
  @IsIn([
    PaymentMethod.CASH,
    PaymentMethod.DEBIT,
    PaymentMethod.CREDIT,
    PaymentMethod.PIX,
    // `COURTESY` (agente 31) é a forma de fechar SEM cobrar. `SUBSCRIPTION` e
    // `LOYALTY` continuam de fora: são descontos que reduzem o total, não
    // maneiras de quitá-lo.
    PaymentMethod.COURTESY,
  ])
  method!: PaymentMethod;

  /**
   * `Min(0)` e não `IsPositive`: a cortesia é o pagamento de R$ 0,00. Que só
   * ELA possa ser zero é regra de negócio, conferida em `OrdersService.close`
   * — aqui só se abre a porta para o valor.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountCents!: number;
}

export class CloseOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentSplitDto)
  payments!: OrderPaymentSplitDto[];

  /**
   * Obrigatório quando a comanda fecha sem cobrar — a checagem mora no serviço
   * porque depende do TOTAL recalculado dentro da transação, que o DTO não vê.
   * Aqui só se garante o formato.
   */
  @ApiPropertyOptional({ minLength: 5, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  courtesyReason?: string;
}

export class ReopenOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
