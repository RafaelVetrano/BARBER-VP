import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ClientListSort } from '@barbervp/types';
import { IsBooleanString, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const SORT_FIELDS: ClientListSort[] = ['name', 'lastVisitAt', 'visitCount', 'createdAt'];

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

  @ApiPropertyOptional({ enum: SORT_FIELDS })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sort?: ClientListSort;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
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
