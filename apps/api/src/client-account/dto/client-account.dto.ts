import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class RateAppointmentDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  comment?: string;
}

/**
 * Cartão do mock de pagamento — SÓ o necessário para simular a cobrança.
 * O serviço extrai os 4 últimos dígitos e descarta o resto: número completo e
 * CVV nunca chegam a ser persistidos, nem no driver mock.
 */
export class SubscribeCardDto {
  @ApiProperty({ example: '4111 1111 1111 1111' })
  @IsString()
  @Matches(/^[\d\s]{13,19}$/, { message: 'Número do cartão inválido' })
  number!: string;

  @ApiProperty({ example: '12/28' })
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'Validade no formato MM/AA' })
  expiry!: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'CVV inválido' })
  cvv!: string;

  @ApiProperty({ example: 'JOAO P LIMA' })
  @IsString()
  @Length(2, 80)
  holderName!: string;
}

export class SubscribeDto {
  @ApiProperty()
  @IsString()
  planId!: string;

  @ApiProperty({ enum: ['CREDIT_CARD', 'PIX'] })
  @IsIn(['CREDIT_CARD', 'PIX'])
  paymentMethod!: 'CREDIT_CARD' | 'PIX';

  @ApiPropertyOptional({ type: SubscribeCardDto, description: 'Obrigatório quando `paymentMethod = CREDIT_CARD`.' })
  @ValidateIf((dto: SubscribeDto) => dto.paymentMethod === 'CREDIT_CARD')
  @ValidateNested()
  @Type(() => SubscribeCardDto)
  card?: SubscribeCardDto;
}
