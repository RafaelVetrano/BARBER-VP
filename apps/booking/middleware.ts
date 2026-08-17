import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware do booking.
 *
 * A página pública da barbearia (`/{slug}`) é indexada — a sessão do cliente é
 * opcional ali, e o `ClienteAuth` só entra quando o visitante decide agendar.
 * Por isso nada aqui bloqueia rota: o booking anônimo é o caminho principal.
 */
export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  void request;
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
