import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsBrazilPhone } from '../../auth/validators/is-brazil-phone.validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Passo 1 — dados da barbearia. */
export class OnboardingProfileDto {
  @ApiProperty({ example: 'Barbearia Central' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome da barbearia.' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '(11) 98765-4321', description: 'Telefone / WhatsApp da barbearia.' })
  @IsBrazilPhone({ allowLandline: true })
  phone!: string;

  @ApiPropertyOptional({ example: 'barbearia.central', description: 'Handle, sem @.' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '') : value,
  )
  @IsString()
  @MaxLength(30)
  instagram?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Alimenta a seção "Sobre" da página pública.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: 'A descrição tem no máximo 200 caracteres.' })
  description?: string;
}

/** Passo 2 — localização (CEP preenchido pela ViaCEP, endereço editável). */
export class OnboardingLocationDto {
  @ApiPropertyOptional({ example: '01310-100' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{8}$/, { message: 'Digite um CEP com 8 dígitos.' })
  zip?: string;

  @ApiProperty({ example: 'Avenida Paulista' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe a rua.' })
  @MaxLength(160)
  street!: string;

  @ApiProperty({ example: '1000' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Informe o número.' })
  @MaxLength(20)
  number!: string;

  @ApiPropertyOptional({ example: 'Sala 12' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  complement?: string;

  @ApiPropertyOptional({ example: 'Bela Vista' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  neighborhood?: string;

  @ApiProperty({ example: 'São Paulo' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe a cidade.' })
  @MaxLength(80)
  city!: string;

  @ApiProperty({ example: 'SP' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Length(2, 2, { message: 'UF tem 2 letras.' })
  state!: string;
}

/** Passo 3 — identidade e link público (pulável). */
export class OnboardingIdentityDto {
  @ApiProperty({ example: 'barbearia-central' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : value,
  )
  @IsString()
  @MinLength(3, { message: 'O link precisa de ao menos 3 caracteres.' })
  @MaxLength(63)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'URL de logo inválida.' })
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'URL de capa inválida.' })
  coverUrl?: string;
}

export class OnboardingServiceDto {
  @ApiPropertyOptional({ description: 'Id do serviço existente; ausente = criar.' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Corte degradê' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome do serviço.' })
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 45, description: 'Duração em minutos.' })
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin!: number;

  @ApiProperty({ example: 4500, description: 'Preço em centavos.' })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  priceCents!: number;
}

/** Passo 4 — serviços iniciais, em lote (substitui a lista inteira). */
export class OnboardingServicesDto {
  @ApiProperty({ type: [OnboardingServiceDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Cadastre ao menos um serviço.' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OnboardingServiceDto)
  services!: OnboardingServiceDto[];
}

export class OnboardingBarberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Carlos Silva' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Informe o nome do barbeiro.' })
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: '(11) 98765-4321' })
  @IsOptional()
  @IsBrazilPhone({ allowLandline: true })
  phone?: string;
}

/**
 * Passo 5 — equipe, em lote (pulável). O barbeiro do dono nunca vem aqui: é
 * criado no registro e o serviço o preserva.
 */
export class OnboardingTeamDto {
  @ApiProperty({ type: [OnboardingBarberDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OnboardingBarberDto)
  barbers!: OnboardingBarberDto[];
}

export class OnboardingBusinessHourDto {
  @ApiProperty({ example: 1, description: '0 = domingo … 6 = sábado.' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ example: 540, description: 'Abertura em minutos desde a meia-noite.' })
  @IsInt()
  @Min(0)
  @Max(1_440)
  opensAt!: number;

  @ApiProperty({ example: 1200 })
  @IsInt()
  @Min(0)
  @Max(1_440)
  closesAt!: number;

  @ApiProperty()
  @IsBoolean()
  closed!: boolean;
}

/** Passo 6 — horário de funcionamento, os 7 dias de uma vez. */
export class OnboardingBusinessHoursDto {
  @ApiProperty({ type: [OnboardingBusinessHourDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OnboardingBusinessHourDto)
  hours!: OnboardingBusinessHourDto[];
}

export class SlugQueryDto {
  @ApiProperty({ example: 'studio-navalha' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  slug!: string;
}

export class CepParamDto {
  @ApiProperty({ example: '01310100' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{8}$/, { message: 'Digite um CEP com 8 dígitos.' })
  cep!: string;
}
