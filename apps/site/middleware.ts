import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware do site.
 *
 * O site é indexado (SPEC.md), então nada de `noindex` global — só as telas de
 * auth se excluem, e elas fazem isso pelo `metadata` da própria rota.
 *
 * O que resolve na borda: as rotas de auth nunca podem ser cacheadas por
 * intermediário (carregam token na URL, no caso da recuperação) e não devem
 * vazar a query string no `Referer` ao sair para outro host.
 */
const AUTH_ROUTES = ['/entrar', '/cadastro', '/recuperar-senha'];

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (AUTH_ROUTES.some((route) => request.nextUrl.pathname.startsWith(route))) {
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    // O link de recuperação traz `?token=` — não deixe vazar nem para o mesmo
    // domínio ao clicar num link externo da página.
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Frame-Options', 'DENY');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
