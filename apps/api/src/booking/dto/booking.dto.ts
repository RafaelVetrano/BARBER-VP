import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { IsBrazilPhone } from '../../auth/validators/is-brazil-phone.validator';
import { AVAILABILITY_MAX_DAYS } from '../availability.service';

/** Teto de serviços por agendamento — o catálogo do seed tem 7. */
const MAX_SERVICES = 10;

/** `csv` na query (`serviceIds=a,b`) OU repetido (`serviceIds=a&serviceIds=b`). */
const toStringArray = ({ value }: { value: unknown }): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
};

export class AvailabilityQueryDto {
  @ApiProperty({ description: 'Serviços escolhidos (csv ou repetido).' })
  @Transform(toStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SERVICES)
  @IsString({ each: true })
  serviceIds!: string[];

  @ApiPropertyOptional({ description: 'Barbeiro escolhido. Ausente = sem preferência.' })
  @IsOptional()
  @IsString()
  barberId?: string;

  @ApiPropertyOptional({ description: 'Primeiro dia da faixa, `YYYY-MM-DD`.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from deve ser uma data YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'Dia cujos horários vêm detalhados.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date deve ser uma data YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ default: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AVAILABILITY_MAX_DAYS)
  days?: number;
}

export class QuoteQueryDto {
  @ApiProperty({ description: 'Serviços escolhidos (csv ou repetido).' })
  @Transform(toStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SERVICES)
  @IsString({ each: true })
  serviceIds!: string[];
}

export class CreateAppointmentDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SERVICES)
  @IsString({ each: true })
  serviceIds!: string[];

  @ApiPropertyOptional({ description: 'Ausente/null = "Sem preferência".' })
  @IsOptional()
  @IsString()
  barberId?: string | null;

  @ApiProperty({ description: 'Início do atendimento, ISO 8601 em UTC.' })
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Nome do visitante (obrigatório sem sessão).' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  guestName?: string;

  @ApiPropertyOptional({ description: 'WhatsApp do visitante (obrigatório sem sessão).' })
  @IsOptional()
  @IsBrazilPhone()
  guestPhone?: string;

  @ApiPropertyOptional({ description: 'Guardar os dados neste aparelho (só UI).' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class ConfirmGuestBookingDto {
  @ApiProperty()
  @IsString()
  challengeId!: string;

  @ApiProperty({ description: 'Código de 6 dígitos recebido no WhatsApp.' })
  @Matches(/^\d{6}$/, { message: 'O código tem 6 dígitos.' })
  code!: string;
}

export class AppointmentLookupDto {
  @ApiPropertyOptional({ description: 'Telefone de quem agendou sem conta.' })
  @IsOptional()
  @IsBrazilPhone()
  phone?: string;
}

export class CancelAppointmentDto extends AppointmentLookupDto {
  @ApiPropertyOptional({ maxLength: 240 })
  @IsOptional()
  @IsString()
  @Length(0, 240)
  reason?: string;
}

export class RescheduleAppointmentDto extends AppointmentLookupDto {
  @ApiProperty({ description: 'Novo início, ISO 8601 em UTC.' })
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({ description: 'Trocar de barbeiro junto. Ausente = mantém.' })
  @IsOptional()
  @IsString()
  barberId?: string | null;
}
