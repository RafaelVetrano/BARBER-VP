import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ACCOUNT_DELETION_CONFIRM_WORD } from '@barbervp/types';

/** `''` (campo esvaziado na tela) vira `null`; o resto passa aparado. */
const emptyToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class UpdateMyProfileDto {
  @ApiPropertyOptional({ description: 'Nome exibido. Recusado com 403 para o papel BARBER.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @MaxLength(180)
  email?: string;

  @ApiPropertyOptional({ description: 'WhatsApp. Vazio limpa o telefone.', nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20)
  phone?: string | null;
}

export class RequestAccountDeletionDto {
  @ApiProperty({
    description: `Confirmação por extenso — tem de ser "${ACCOUNT_DELETION_CONFIRM_WORD}".`,
    example: ACCOUNT_DELETION_CONFIRM_WORD,
  })
  @IsString()
  // A palavra é validada aqui E no serviço: o `Matches` devolve 400 com a
  // mensagem certa no formulário, e a checagem do serviço protege quem chamar
  // o endpoint por fora da tela.
  @Matches(new RegExp(`^${ACCOUNT_DELETION_CONFIRM_WORD}$`), {
    message: `Digite ${ACCOUNT_DELETION_CONFIRM_WORD} para confirmar.`,
  })
  confirm!: string;
}
