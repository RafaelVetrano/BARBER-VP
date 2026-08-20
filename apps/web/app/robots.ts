import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';

/**
 * Um só `robots.txt` para as quatro superfícies (fase 11) — mas com a resposta
 * decidida pelo HOST, que é o que cada app antiga fazia por si.
 *
 * Nos hosts internos (painel e super admin) o arquivo continua sendo
 * `Disallow: /`, como era em `apps/dashboard` e `apps/admin`. Nos hosts
 * públicos, a landing e a página da barbearia são indexadas e só os prefixos
 * internos ficam de fora.
 *
 * Isto NÃO é a única camada: os layouts de `(dashboard)` e `(admin)` declaram
 * `robots: { index: false }` e o middleware manda `X-Robots-Tag` em toda
 * resposta interna. O `robots.txt` é a camada que o robô lê antes de pedir a
 * página.
 */
const INTERNAL_HOSTS = [process.env.HOST_APP, process.env.HOST_ADMIN]
  .filter((host): host is string => Boolean(host))
  .map((host) => host.toLowerCase());

export default function robots(): MetadataRoute.Robots {
  const [host] = (headers().get('host') ?? '').toLowerCase().split(':');

  if (host && INTERNAL_HOSTS.includes(host)) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/admin', '/entrar', '/cadastro', '/recuperar-senha'],
    },
  };
}
