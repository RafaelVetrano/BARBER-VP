/**
 * As quatro apps são deploys independentes, em origens diferentes: navegar
 * entre elas é `window.location`, não `router.push`. As URLs vêm do ambiente,
 * as mesmas que a API usa no CORS.
 */

export const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3002';
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL ?? 'http://localhost:3001';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
/** Super Admin (fase 08) — `SUPER_ADMIN` não tem `Membership`/tenant nenhum, então nunca vai para o dashboard. */
export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3003';
