import { Inject, Injectable } from '@nestjs/common';
import { REFRESH_COOKIE, TokenAudience } from '@barbervp/types';
import type { CookieOptions, Response } from 'express';
import { CONFIG, type AppConfig } from '../../config/configuration';
import type { RequestContext } from '../../common/types/request-context';

/**
 * Cookie httpOnly do refresh token.
 *
 * Decisões que valem comentário:
 *
 * · **`httpOnly`** — o refresh nunca é legível por JS; o access token vive só
 *   em memória no cliente. Nenhum dos dois toca `localStorage`.
 * · **`SameSite=Lax`** — em dev as apps são `localhost:3000..3003` e a API é
 *   `localhost:3333`: mesmo site, portas diferentes (porta não conta para
 *   same-site), então `Lax` funciona. Em produção as quatro apps ficam sob o
 *   mesmo domínio registrável da API, então continua valendo. `Strict` quebraria
 *   o retorno do link de recuperação de senha.
 * · **`path` escopado** — o cookie de estabelecimento só é enviado para
 *   `/{prefix}/auth/*` e o de cliente para `/{prefix}/client-auth/*`. Todo o
 *   resto da API nunca vê o refresh, nem por acidente.
 */
@Injectable()
export class RefreshCookieService {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  set(response: Response, audience: TokenAudience, token: string, expiresAt: Date): void {
    response.cookie(this.name(audience), token, {
      ...this.baseOptions(audience),
      expires: expiresAt,
    });
  }

  clear(response: Response, audience: TokenAudience): void {
    response.clearCookie(this.name(audience), this.baseOptions(audience));
  }

  read(request: RequestContext, audience: TokenAudience): string | null {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[this.name(audience)] ?? null;
  }

  private name(audience: TokenAudience): string {
    return audience === TokenAudience.CLIENT ? REFRESH_COOKIE.CLIENT : REFRESH_COOKIE.ESTABLISHMENT;
  }

  private baseOptions(audience: TokenAudience): CookieOptions {
    const segment = audience === TokenAudience.CLIENT ? 'client-auth' : 'auth';
    return {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: 'lax',
      domain: this.config.auth.cookieDomain,
      path: `/${this.config.prefix}/${segment}`,
    };
  }
}
