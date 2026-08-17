import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware do super admin.
 *
 * Como o do painel, NÃO decide sessão: o refresh é httpOnly e escopado no host
 * da API, invisível para a borda do Next. A guarda real é do provider de auth
 * (fase 08, quando o admin ganhar telas). Aqui ficam `noindex` e os cabeçalhos
 * de proteção que valem para qualquer resposta.
 */
export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');

  void request;
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
