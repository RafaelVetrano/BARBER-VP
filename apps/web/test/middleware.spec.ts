import { NextRequest } from 'next/server';

/**
 * Guarda de host do super admin (fase 11).
 *
 * `/admin/*` responde 404 SECO em qualquer host que não seja o do admin. Foi
 * verificada ao vivo com `curl -H "Host: ..."` quando a fase 11 juntou as
 * quatro apps numa só, mas nada reprovava no CI se alguém a quebrasse — e é
 * ela que compensa a perda da separação física em quatro deploys. A defesa
 * REAL continua sendo o RBAC `SUPER_ADMIN` no servidor; esta é a primeira
 * porta.
 */
describe('middleware — roteamento por host', () => {
  const HOSTS = {
    HOST_SITE: 'barbervp.com',
    HOST_BOOKING: 'agendar.barbervp.com',
    HOST_APP: 'app.barbervp.com',
    HOST_ADMIN: 'admin.barbervp.com',
  };

  /**
   * O mapa host → superfície é montado na CARGA do módulo, a partir do
   * ambiente. Cada cenário precisa, então, de uma importação limpa.
   */
  async function loadMiddleware(env: Record<string, string | undefined>) {
    const previous = { ...process.env };
    Object.assign(process.env, env);
    let middleware!: (request: NextRequest) => { status: number; headers: Headers };
    await jest.isolateModulesAsync(async () => {
      ({ middleware } = await import('../middleware'));
    });
    process.env = previous;
    return middleware;
  }

  const requestFor = (host: string, pathname: string) =>
    new NextRequest(`https://${host}${pathname}`, { headers: { host } });

  describe('com HOST_* configurado (produção)', () => {
    it.each([
      ['app.barbervp.com'],
      ['barbervp.com'],
      ['agendar.barbervp.com'],
    ])('/admin/tenants responde 404 seco no host %s', async (host) => {
      const middleware = await loadMiddleware(HOSTS);
      const response = middleware(requestFor(host, '/admin/tenants'));

      expect(response.status).toBe(404);
      expect(response.headers.get('x-robots-tag')).toContain('noindex');
    });

    it('/admin/tenants passa no host do admin', async () => {
      const middleware = await loadMiddleware(HOSTS);
      const response = middleware(requestFor('admin.barbervp.com', '/admin/tenants'));

      expect(response.status).toBe(200);
      expect(response.headers.get('x-robots-tag')).toContain('noindex');
    });

    it('o host do painel reescreve para o prefixo /app sem duplicá-lo', async () => {
      const middleware = await loadMiddleware(HOSTS);

      // URL antiga, de quando o painel tinha domínio só seu.
      const short = middleware(requestFor('app.barbervp.com', '/agenda'));
      expect(short.headers.get('x-middleware-rewrite')).toContain('/app/agenda');

      // URL que os links internos usam — não pode virar `/app/app/agenda`.
      const already = middleware(requestFor('app.barbervp.com', '/app/agenda'));
      expect(already.headers.get('x-middleware-rewrite')).toBeNull();
    });

    it('a raiz do host de booking não cai na landing de vendas', async () => {
      const middleware = await loadMiddleware(HOSTS);
      const response = middleware(requestFor('agendar.barbervp.com', '/'));

      expect(response.headers.get('x-middleware-rewrite')).toContain('/agendar');
    });
  });

  describe('sem HOST_* (modo prefixo direto — o dev)', () => {
    const NO_HOSTS = {
      HOST_SITE: undefined,
      HOST_BOOKING: undefined,
      HOST_APP: undefined,
      HOST_ADMIN: undefined,
    };

    it('o admin abre por localhost:3000/admin', async () => {
      const middleware = await loadMiddleware(NO_HOSTS);
      const response = middleware(requestFor('localhost', '/admin/tenants'));

      expect(response.status).toBe(200);
    });

    it('nada é reescrito', async () => {
      const middleware = await loadMiddleware(NO_HOSTS);
      const response = middleware(requestFor('localhost', '/app/agenda'));

      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    });
  });

  describe('cabeçalhos por superfície', () => {
    it('o painel sai noindex e sem iframe', async () => {
      const middleware = await loadMiddleware(HOSTS);
      const response = middleware(requestFor('app.barbervp.com', '/app/agenda'));

      expect(response.headers.get('x-robots-tag')).toContain('noindex');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    });

    it('as telas de auth saem no-store e sem referer', async () => {
      const middleware = await loadMiddleware(HOSTS);
      const response = middleware(requestFor('barbervp.com', '/recuperar-senha'));

      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    });
  });
});
