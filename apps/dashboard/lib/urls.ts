/** As quatro apps são origens distintas — navegar entre elas é `window.location`. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL ?? 'http://localhost:3001';

/** Login do painel — mora no site (`apps/site`), não aqui. */
export const LOGIN_URL = `${SITE_URL}/entrar`;
