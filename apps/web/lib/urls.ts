/**
 * Endereços das superfícies — fase 11.
 *
 * Antes eram quatro apps em origens distintas, e navegar entre elas era
 * `window.location` para uma URL absoluta vinda do ambiente. Agora é UM
 * frontend: por padrão as superfícies são caminhos da mesma origem, e a
 * navegação continua funcionando em `localhost:3000` sem configurar nada.
 *
 * Em produção o `middleware.ts` serve cada superfície num host próprio
 * (`barbervp.com`, `agendar.`, `app.`, `admin.`). Definir os `NEXT_PUBLIC_*_URL`
 * abaixo faz os links apontarem para o host certo em vez de ficarem no host
 * atual; sem eles, o link é relativo e o visitante permanece onde está — que é
 * o comportamento correto em dev e um fallback seguro em produção.
 */

/** Tira a barra final para as concatenações abaixo nunca produzirem `//`. */
function origin(value: string | undefined): string {
  return value ? value.replace(/\/+$/, '') : '';
}

/** Marketing: landing, login, cadastro, recuperação de senha. */
export const SITE_URL = origin(process.env.NEXT_PUBLIC_SITE_URL);
/** Booking público — a raiz explicativa; a página da barbearia é `${BOOKING_URL}/{slug}`. */
export const BOOKING_URL = `${origin(process.env.NEXT_PUBLIC_BOOKING_URL)}/agendar`;
/** Painel da barbearia. */
export const DASHBOARD_URL = `${origin(process.env.NEXT_PUBLIC_DASHBOARD_URL)}/app`;
/** Super Admin — `SUPER_ADMIN` não tem `Membership`/tenant nenhum, então nunca vai para o painel. */
export const ADMIN_URL = `${origin(process.env.NEXT_PUBLIC_ADMIN_URL)}/admin`;

/** Login do estabelecimento — mora no marketing, não no painel. */
export const LOGIN_URL = `${SITE_URL}/entrar`;

/**
 * Origem ABSOLUTA do site, só para SEO: `metadataBase` e o JSON-LD da landing
 * exigem URL completa — canonical relativo não consolida sinal de busca.
 */
export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * Origem ABSOLUTA do booking, só para SEO: no frontend único a rota `/{slug}`
 * responde em qualquer host, e o canonical precisa apontar para um só. Vazia em
 * dev — aí o canonical volta a ser relativo ao host atual, como antes.
 */
export const BOOKING_ORIGIN = origin(process.env.NEXT_PUBLIC_BOOKING_URL);
