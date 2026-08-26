import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { AgendaView } from '@barbervp/types';

/** `HH:MM` em 24h — o formato que `<input type="time">` entrega. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * O dropdown de barbeiros é multi-seleção. Aceita `?barberIds=a&barberIds=b`
 * e `?barberIds=a,b` — o front usa a segunda forma, mas a primeira é o que um
 * cliente HTTP comum produz e quebrar nela seria uma armadilha.
 */
function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const flat = raw.flatMap((entry) => String(entry).split(','));
  const cleaned = flat.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return cleaned.length > 0 ? [...new Set(cleaned)] : undefined;
}

export class StaffAgendaQueryDto {
  @IsISO8601({ strict: true })
  date!: string;

  @IsIn(Object.values(AgendaView))
  view!: AgendaView;

  @ApiPropertyOptional({
    isArray: true,
    type: String,
    description: 'Ignorado para o papel BARBER — o backend sempre filtra pelo próprio',
  })
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  barberIds?: string[];
}

export class StaffAgendaMonthQueryDto {
  @ApiPropertyOptional({ description: 'Qualquer dia do mês desejado (`YYYY-MM-DD`)' })
  @IsISO8601({ strict: true })
  date!: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  barberIds?: string[];
}

export class StaffAgendaSlotsQueryDto {
  @IsISO8601({ strict: true })
  date!: string;

  @IsString()
  barberId!: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @Transform(({ value }) => toStringArray(value) ?? [])
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serviceIds!: string[];

  @ApiPropertyOptional({ description: 'Agendamento sendo remarcado — o próprio horário não conta como ocupado' })
  @IsOptional()
  @IsString()
  ignoreAppointmentId?: string;
}

class WalkInDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  phone!: string;
}

export class CreateStaffAppointmentDto {
  @IsString()
  barberId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  serviceIds!: string[];

  @IsISO8601()
  startsAt!: string;

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
  @Length(0, 500)
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Toggle "Enviar confirmação por WhatsApp" do modal' })
  @IsOptional()
  @IsBoolean()
  notifyWhatsapp?: boolean;
}

export class MoveStaffAppointmentDto {
  @IsISO8601()
  startsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barberId?: string;
}

export class CancelStaffAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 240)
  reason?: string | null;
}

export class CreateStaffAgendaBlockDto {
  @ApiPropertyOptional({ description: '`null` = barbearia inteira (o "Todos" do modal)' })
  @IsOptional()
  @IsString()
  barberId?: string | null;

  @IsISO8601({ strict: true })
  startDate!: string;

  @IsISO8601({ strict: true })
  endDate!: string;

  @ApiPropertyOptional({ description: '`HH:MM`; ausente junto com `endTime` = dia inteiro' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'Hora de início inválida.' })
  startTime?: string | null;

  @ApiPropertyOptional({ description: '`HH:MM`' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'Hora de fim inválida.' })
  endTime?: string | null;

  @IsString()
  @Length(1, 60)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 240)
  notes?: string | null;
}
