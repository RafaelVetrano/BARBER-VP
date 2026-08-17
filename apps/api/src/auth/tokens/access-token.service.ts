import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenAudience, type AccessTokenClaims, type Role } from '@barbervp/types';
import { CONFIG, type AppConfig } from '../../config/configuration';

export interface AccessTokenInput {
  subjectId: string;
  audience: TokenAudience;
  /** Tenant ativo — `null` para cliente e para dono sem barbearia escolhida. */
  tenantId: string | null;
  roles: Role[];
  isSuperAdmin: boolean;
  sessionId: string;
}

/**
 * Emissão e verificação do access token (15 min por padrão).
 *
 * O token carrega o tenant ativo (`tid`) e os papéis DAQUELE tenant (`rol`) —
 * é o que faz a regra 3 valer: o `TenantGuard` lê o tenant do token, e trocar
 * de barbearia exige um token novo (`POST /auth/context`), nunca um campo no
 * corpo da requisição.
 */
@Injectable()
export class AccessTokenService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {
    this.ttlSeconds = parseTtlSeconds(config.jwt.accessTtl);
  }

  get expiresInSeconds(): number {
    return this.ttlSeconds;
  }

  sign(input: AccessTokenInput): string {
    return this.jwt.sign(
      {
        aud: input.audience,
        tid: input.tenantId,
        rol: input.roles,
        sa: input.isSuperAdmin,
        sid: input.sessionId,
      },
      {
        subject: input.subjectId,
        secret: this.config.jwt.accessSecret,
        expiresIn: this.ttlSeconds,
      },
    );
  }

  /** Devolve as claims ou `null` — assinatura inválida e expiração são o mesmo caso. */
  verify(token: string): AccessTokenClaims | null {
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(token, {
        secret: this.config.jwt.accessSecret,
      });
      if (claims.aud !== TokenAudience.ESTABLISHMENT && claims.aud !== TokenAudience.CLIENT) {
        return null;
      }
      return claims;
    } catch {
      return null;
    }
  }
}

/**
 * `15m` / `30d` / `900` → segundos. O env aceita a notação do `jsonwebtoken`,
 * mas precisamos do número para devolver `expiresIn` ao frontend e para calcular
 * a expiração do cookie.
 */
export function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!match) {
    throw new Error(`TTL de JWT inválido: "${ttl}" (use 900, 15m, 12h ou 30d)`);
  }
  const value = Number(match[1]);
  switch (match[2]) {
    case 'd':
      return value * 86_400;
    case 'h':
      return value * 3_600;
    case 'm':
      return value * 60;
    default:
      return value;
  }
}
