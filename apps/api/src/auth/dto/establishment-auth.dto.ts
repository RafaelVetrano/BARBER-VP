import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../validators/is-strong-password.validator';
import { IsBrazilPhone } from '../validators/is-brazil-phone.validator';

/** `@Transform` de e-mail: minúsculas sem espaço — a chave é sempre canônica. */
const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CheckEmailDto {
  @ApiProperty({ example: 'voce@suabarbearia.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'E-mail inválido.' })
  email!: string;
}

export class RegisterEstablishmentDto {
  @ApiProperty({ example: 'João Silva', description: 'Nome completo do dono.' })
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Informe seu nome completo.' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '(11) 98765-4321' })
  @IsBrazilPhone({ message: 'Celular inválido — informe DDD e 9 dígitos.' })
  phone!: string;

  @ApiProperty({ example: 'voce@suabarbearia.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'E-mail inválido.' })
  email!: string;

  @ApiProperty({ example: 'minhasenha123', minLength: 8 })
  @IsStrongPassword()
  password!: string;

  @ApiProperty({ example: 'Studio Navalha', description: 'Nome da barbearia.' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome da barbearia.' })
  @MaxLength(120)
  shopName!: string;

  @ApiProperty({ description: 'Aceite dos termos de uso e da política de privacidade.' })
  @IsBoolean()
  acceptTerms!: boolean;
}

/**
 * Vínculo do fluxo "Que bom te ver de novo!": o e-mail já é conta de cliente e
 * o dono confirma a senha atual para reaproveitar a mesma identidade.
 */
export class LinkClientAccountDto {
  @ApiProperty({ example: 'lucas.andrade@email.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'E-mail inválido.' })
  email!: string;

  @ApiProperty({ description: 'Senha ATUAL da conta de cliente.' })
  @IsString()
  @IsNotEmpty({ message: 'Digite sua senha para confirmar.' })
  password!: string;

  @ApiProperty({ example: 'Studio Navalha' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome da barbearia.' })
  @MaxLength(120)
  shopName!: string;

  @ApiProperty()
  @IsBoolean()
  acceptTerms!: boolean;
}

export class LoginEstablishmentDto {
  @ApiProperty({ example: 'dono@barbeariacentral.com.br' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'E-mail inválido.' })
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Informe sua senha.' })
  password!: string;

  @ApiPropertyOptional({
    description: 'Barbearia a abrir quando o usuário tem mais de um vínculo.',
  })
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class SwitchContextDto {
  @ApiProperty({ description: 'Id da barbearia a assumir — precisa ser um vínculo do usuário.' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Informe a senha atual.' })
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsStrongPassword()
  newPassword!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'E-mail inválido.' })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recebido no e-mail de recuperação.' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsStrongPassword()
  password!: string;
}
