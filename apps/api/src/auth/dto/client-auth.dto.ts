import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../validators/is-strong-password.validator';
import { IsBrazilPhone } from '../validators/is-brazil-phone.validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** O campo "Telefone ou e-mail" do protótipo — um só input para os dois. */
export class ClientLoginDto {
  @ApiProperty({ example: '(16) 9 9999-0001', description: 'Telefone OU e-mail da conta.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe seu telefone ou e-mail.' })
  identifier!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Informe sua senha.' })
  password!: string;
}

export class ClientRegisterDto {
  @ApiProperty({ example: 'João Pedro' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Mínimo 2 caracteres' })
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Lima' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Mínimo 2 caracteres' })
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ example: '(16) 9 9999-0001', description: 'WhatsApp — identidade da conta.' })
  @IsBrazilPhone({ message: 'Número incompleto' })
  phone!: string;

  @ApiProperty({ example: 'voce@email.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'E-mail inválido' })
  email!: string;

  @ApiProperty({ description: 'Repetição do e-mail — o protótipo bloqueia colar.' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Os e-mails não coincidem' })
  confirmEmail!: string;

  @ApiProperty({ minLength: 8 })
  @IsStrongPassword({ message: 'Mínimo 8 caracteres, com letra e número' })
  password!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  confirmPassword!: string;

  @ApiProperty({ description: 'Aceite dos termos — obrigatório.' })
  @IsBoolean()
  acceptTerms!: boolean;

  @ApiPropertyOptional({ description: 'Opt-in de lembretes e promoções no WhatsApp.' })
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;
}

export class OtpVerifyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Length(6, 6, { message: 'O código tem 6 dígitos.' })
  @Matches(/^\d{6}$/, { message: 'O código tem 6 dígitos.' })
  code!: string;
}

export class OtpChallengeRefDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  challengeId!: string;
}

export class OtpResendDto extends OtpChallengeRefDto {
  @ApiPropertyOptional({ enum: ['WHATSAPP', 'SMS', 'EMAIL'] })
  @IsOptional()
  @IsIn(['WHATSAPP', 'SMS', 'EMAIL'])
  channel?: 'WHATSAPP' | 'SMS' | 'EMAIL';
}

export class ClientForgotPasswordDto {
  @ApiProperty({ example: '(16) 9 9999-0001', description: 'Telefone OU e-mail da conta.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe seu telefone ou e-mail.' })
  identifier!: string;
}

export class ClientResetPasswordDto {
  @ApiProperty({ description: 'Token devolvido pela verificação do OTP de recuperação.' })
  @IsString()
  @IsNotEmpty()
  resetToken!: string;

  @ApiProperty({ minLength: 8 })
  @IsStrongPassword({ message: 'Mínimo 8 caracteres, com letra e número' })
  password!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  confirmPassword!: string;
}

// ── "Meus dados" (fase 05) ───────────────────────────────────────────────────

/** `PATCH /client-auth/me` — nome, e-mail e preferências de notificação. */
export class UpdateClientProfileDto {
  @ApiPropertyOptional({ example: 'João Pedro Lima' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Mínimo 2 caracteres' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'voce@email.com' })
  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @ApiPropertyOptional({ description: 'Lembrete de agendamento por WhatsApp.' })
  @IsOptional()
  @IsBoolean()
  notifyWhatsapp?: boolean;

  @ApiPropertyOptional({ description: 'Lembrete de agendamento por e-mail.' })
  @IsOptional()
  @IsBoolean()
  notifyEmail?: boolean;
}

/** `POST /client-auth/me/phone` — início da troca (dispara o OTP). */
export class RequestPhoneChangeDto {
  @ApiProperty({ example: '(16) 9 9999-0001', description: 'Novo WhatsApp.' })
  @IsBrazilPhone({ message: 'Número incompleto' })
  phone!: string;
}

/** `POST /client-auth/me/phone/confirm` — segunda metade, com o código de 6 dígitos. */
export class ConfirmPhoneChangeDto extends OtpChallengeRefDto {
  @ApiProperty({ example: '123456' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Length(6, 6, { message: 'O código tem 6 dígitos.' })
  @Matches(/^\d{6}$/, { message: 'O código tem 6 dígitos.' })
  code!: string;
}

/** `POST /client-auth/password/change` — logado, com a senha atual como prova. */
export class ChangeClientPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Informe sua senha atual.' })
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsStrongPassword({ message: 'Mínimo 8 caracteres, com letra e número' })
  newPassword!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  confirmNewPassword!: string;
}

/** `POST /client-auth/me/delete` — o checkbox "entendo que é irreversível" do protótipo. */
export class DeleteClientAccountDto {
  @ApiProperty({ description: 'Precisa ser `true` — é o checkbox de confirmação da tela.' })
  @IsBoolean()
  confirm!: boolean;
}
