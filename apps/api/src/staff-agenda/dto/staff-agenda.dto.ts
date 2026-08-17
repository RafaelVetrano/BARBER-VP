import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { AgendaView } from '@barbervp/types';

export class StaffAgendaQueryDto {
  @IsISO8601({ strict: true })
  date!: string;

  @IsIn(Object.values(AgendaView))
  view!: AgendaView;

  @ApiPropertyOptional({ description: 'Ignorado para o papel BARBER — o backend sempre filtra pelo próprio' })
  @IsOptional()
  @IsString()
  barberId?: string;
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
