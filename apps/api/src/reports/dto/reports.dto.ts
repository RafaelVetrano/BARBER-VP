import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { REPORT_PERIOD_KEYS, type ReportPeriodKey } from '@barbervp/types';

export class ReportPeriodQueryDto {
  @ApiPropertyOptional({ enum: REPORT_PERIOD_KEYS, description: 'Pílula de período — padrão `30d`' })
  @IsOptional()
  @IsIn(REPORT_PERIOD_KEYS)
  period?: ReportPeriodKey;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD — obrigatório com `period=custom`' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD — obrigatório com `period=custom`' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  /**
   * Aceita `barberIds=a&barberIds=b` e `barberIds=a,b` — o filtro do protótipo
   * é multi-seleção e o front serializa a lista repetindo a chave; a forma com
   * vírgula existe para quem chama a API na mão.
   */
  @ApiPropertyOptional({ isArray: true, type: String, description: 'Vazio = todos os barbeiros' })
  @IsOptional()
  @Transform(({ value }) => {
    // `@Transform` roda MESMO quando o parâmetro não veio — sem esta saída, um
    // `undefined` virava a string "undefined", a consulta passava a filtrar por
    // um barbeiro inexistente e a aba inteira zerava.
    if (value === undefined || value === null) {
      return undefined;
    }
    const entries = (Array.isArray(value) ? value : [value])
      .flatMap((entry: unknown) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
    return entries.length > 0 ? entries : undefined;
  })
  @IsArray()
  @IsString({ each: true })
  barberIds?: string[];

  @ApiPropertyOptional({ description: 'Vazio = todas as unidades' })
  @IsOptional()
  @IsString()
  unitId?: string;
}
