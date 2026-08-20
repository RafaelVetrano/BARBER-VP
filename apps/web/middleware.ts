import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware do frontend único (fase 11).
 *
 * Faz duas coisas, nesta ordem:
 *
 *  1. **Roteamento por host.** As quatro superfícies vivem numa árvore só de
 *     rotas, separadas por prefixo (`/`, `/agendar` + `/{slug}`, `/app/*`,
 *     `/admin/*`). Em produção cada host resolve para o seu prefixo; em
 *     desenvolvimento (localhost, sem `HOST_*` configurado) o prefixo é digitado
 *     direto na URL e nada é reescrito.
 *  2. **Cabeçalhos por superfície.** `noindex` no painel e no super admin,
 *     `no-store` nas telas de auth, e as proteções que valem para tudo. É o que
 *     os quatro middlewares antigos faziam, agora decidido pelo prefixo.
 *
 * O que ele NÃO faz, de propósito: decidir se há sessão. O refresh token é
 * httpOnly e escopado em `/api/v1/auth` no host da API — o middleware do Next
 * não o enxerga, e o access token vive só na memória do navegador. Fingir uma
 * decisão de sessão aqui só produziria redirecionamento errado (mandaria para o
 * login quem tem sessão válida). Quem decide é o `DashboardGuard`/`AdminGuard`,
 * depois que o provider tenta o refresh.
 */

type Surface = 'site' | 'booking' | 'app' | 'admin';

/**
 * Mapa host → superfície. Definido só em produção; sem ele o middleware roda em
 * modo "prefixo direto", que é como o `localhost:3000` funciona.
 *
 * Ex.: HOST_SITE=barbervp.com · HOST_BOOKING=agendar.barbervp.com
 *      HOST_APP=app.barbervp.com · HOST_ADMIN=admin.barbervp.com
 */
const HOST_MAP: Record<string, Surface> = Object.fromEntries(
  (
    [
      [process.env.HOST_SITE, 'site'],
      [process.env.HOST_BOOKING, 'booking'],
      [process.env.HOST_APP, 'app'],
      [process.env.HOST_ADMIN, 'admin'],
    ] as Array<[string | undefined, Surface]>
  )
    .filter((entry): entry is [string, Surface] => Boolean(entry[0]))
    .map(([host, surface]) => [host.toLowerCase(), surface]),
);

const HOSTS_CONFIGURED = Object.keys(HOST_MAP).length > 0;

/** `agendar.barbervp.com:3000` → `agendar.barbervp.com`. */
function hostname(request: NextRequest): string {
  const [host] = (request.headers.get('host') ?? '').toLowerCase().split(':');
  return host ?? '';
}

function isAuthRoute(pathname: string): boolean {
  return (
    pathname === '/entrar' ||
    pathname === '/cadastro' ||
    pathname === '/recuperar-senha' ||
    pathname.startsWith('/entrar/') ||
    pathname.startsWith('/cadastro/') ||
    pathname.startsWith('/recuperar-senha/')
  );
}

function isInternalSurface(pathname: string): boolean {
  return pathname === '/app' || pathname === '/admin' || pathname.startsWith('/app/') || pathname.startsWith('/admin/');
}

/**
 * Cabeçalhos da resposta, decididos pelo caminho JÁ resolvido (depois do
 * rewrite de host).
 */
function withHeaders(response: NextResponse, pathname: string): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (isInternalSurface(pathname)) {
    // Superfície interna: fora do índice, inclusive em respostas que não passam
    // pelo `metadata` do App Router. E nunca embutida em iframe de terceiro.
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('X-Frame-Options', 'DENY');
    return response;
  }

  if (isAuthRoute(pathname)) {
    // Nunca cacheadas por intermediário (o link de recuperação traz `?token=`)
    // e sem vazar a query string no `Referer` ao sair para outro host.
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Frame-Options', 'DENY');
  }

  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const surface = HOSTS_CONFIGURED ? HOST_MAP[hostname(request)] : undefined;

  /**
   * GUARDA DO SUPER ADMIN.
   *
   * `/admin/*` só responde no host do admin — em qualquer outro, 404 seco. Isto
   * compensa a perda da separação física em quatro deploys; a defesa REAL
   * continua sendo o RBAC `SUPER_ADMIN` no servidor, que não mudou.
   *
   * Só vale quando há host configurado: em dev o admin abre por
   * `localhost:3000/admin`.
   */
  if (HOSTS_CONFIGURED && pathname.startsWith('/admin') && surface !== 'admin') {
    return new NextResponse('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
    });
  }

  // Reescrita de host → prefixo. O `startsWith` deixa passar quem já digitou o
  // prefixo, senão `app.barbervp.com/app/agenda` viraria `/app/app/agenda`.
  let resolved = pathname;

  if (surface === 'app' && !isPrefixed(pathname, '/app')) {
    resolved = joinPrefix('/app', pathname);
  } else if (surface === 'admin' && !isPrefixed(pathname, '/admin')) {
    resolved = joinPrefix('/admin', pathname);
  } else if (surface === 'booking' && pathname === '/') {
    // A raiz do booking explica que cada barbearia tem o próprio link — `/` no
    // host do booking não pode cair na landing de vendas.
    resolved = '/agendar';
  }

  if (resolved !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = resolved;
    return withHeaders(NextResponse.rewrite(url), resolved);
  }

  return withHeaders(NextResponse.next(), pathname);
}

function isPrefixed(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function joinPrefix(prefix: string, pathname: string): string {
  return pathname === '/' ? prefix : `${prefix}${pathname}`;
}

export const config = {
  // Assets e rotas internas do Next ficam de fora.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
