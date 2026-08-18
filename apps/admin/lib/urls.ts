/** `apps/admin` é uma origem distinta — navegar para o login é `window.location`. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
export const LOGIN_URL = `${SITE_URL}/entrar`;
export const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3002';
