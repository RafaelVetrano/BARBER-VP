import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateWhatsappAutomationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  template?: string;

  /**
   * Sempre na unidade do `control` da automação (ver `WHATSAPP_CONTROL`):
   * minutos de antecedência no lembrete, minutos desde a meia-noite no
   * aniversário, dias × 1440 na reativação. O service valida contra a lista de
   * opções que a própria API publicou — mandar 7h de antecedência é 400.
   */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offsetMinutes?: number | null;
}

export class WhatsappHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Id da última linha da página anterior.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
