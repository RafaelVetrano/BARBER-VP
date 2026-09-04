import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import type { ClientListSort, ClientStatus } from '@barbervp/types';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const SORT_FIELDS: ClientListSort[] = ['name', 'lastVisitAt', 'visitCount', 'createdAt'];
const STATUS_VALUES: ClientStatus[] = ['ATIVO', 'INATIVO', 'MENSALISTA', 'BLOQUEADO'];

/** Teto de uma ação em lote — a barra de seleção opera sobre uma página. */
const BULK_MAX = 200;

export class ClientListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Nome, telefone ou e-mail' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  favoriteBarberId?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsBooleanString()
  blocked?: string;

  @ApiPropertyOptional({ enum: STATUS_VALUES, description: 'Chip de filtro da aba Clientes' })
  @IsOptional()
  @IsIn(STATUS_VALUES)
  status?: ClientStatus;

  @ApiPropertyOptional({ enum: SORT_FIELDS })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sort?: ClientListSort;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

/**
 * Exportação: mesma pergunta da listagem, sem paginação — ou a seleção
 * explícita da barra de ações, quando `ids` vem preenchido.
 */
export class ClientExportQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @ApiPropertyOptional({ enum: STATUS_VALUES })
  @IsOptional()
  @IsIn(STATUS_VALUES)
  status?: ClientStatus;

  @ApiPropertyOptional({ description: 'Ids de ClientProfile separados por vírgula' })
  @IsOptional()
  @IsString()
  @Length(1, 8_000)
  ids?: string;
}

export class CreateClientDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(8, 20)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  @Length(0, 180)
  email?: string | null;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString({}, { message: 'Data de nascimento inválida.' })
  birthDate?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Aceita receber mensagens (Client.notifyWhatsapp)' })
  @IsOptional()
  @IsBoolean()
  acceptsMessages?: boolean;
}

export class UpdateClientProfileDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Id do barbeiro favorito — `null` para remover' })
  @IsOptional()
  @IsString()
  favoriteBarberId?: string | null;
}

export class ClientBulkBlockDto {
  @ApiProperty({ type: [String], description: 'Ids de ClientProfile' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_MAX)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty()
  @IsBoolean()
  blocked!: boolean;
}

export class ClientBulkMessageDto {
  @ApiProperty({ type: [String], description: 'Ids de ClientProfile' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_MAX)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @Length(2, 1_000)
  body!: string;
}
