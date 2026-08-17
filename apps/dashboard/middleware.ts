import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware do painel.
 *
 * O que ele NÃO faz, de propósito: decidir se há sessão. O refresh token é
 * httpOnly e escopado em `/api/v1/auth` no host da API — o middleware do Next
 * não o enxerga, e o access token vive só na memória do navegador. Fingir uma
 * decisão de sessão aqui só produziria redirecionamento errado (mandaria para
 * o login quem tem sessão válida).
 *
 * Quem decide é o `DashboardGuard`, depois que o provider tenta o refresh. O
 * middleware cuida do que dá para resolver na borda:
 *
 *  · `noindex` em toda a superfície interna, inclusive em respostas que não
 *    passam pelo `metadata` do App Router;
 *  · cabeçalhos de proteção que valem para qualquer resposta;
 *  · a raiz `/` de quem chega sem rota.
 */
export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // O painel nunca deve ser embutido em iframe de terceiro (clickjacking).
  response.headers.set('X-Frame-Options', 'DENY');

  void request;
  return response;
}

export const config = {
  // Assets e rotas internas do Next ficam de fora.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
