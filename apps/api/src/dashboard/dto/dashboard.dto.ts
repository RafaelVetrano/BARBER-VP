import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { DASHBOARD_PERIODS, type DashboardPeriod } from '@barbervp/types';

export class DashboardOverviewQueryDto {
  @ApiPropertyOptional({
    enum: DASHBOARD_PERIODS,
    description: 'Recorte do gráfico de faturamento. Padrão: `mes` (30 dias).',
  })
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS)
  period?: DashboardPeriod;
}

export class GlobalSearchQueryDto {
  @ApiPropertyOptional({ description: 'Termo buscado — cliente, agendamento ou serviço.' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 80)
  q!: string;
}
