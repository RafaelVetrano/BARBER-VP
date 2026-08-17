import type { Env } from './env.schema';

/** Configuração tipada derivada do env já validado. */
export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  port: number;
  prefix: string;
  logLevel: Env['LOG_LEVEL'];
  databaseUrl: string;
  redisUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  auth: {
    /** `undefined` = cookie host-only (dev). */
    cookieDomain: string | undefined;
    /** `Secure` + `SameSite=None` só em produção (HTTPS). */
    cookieSecure: boolean;
    otpTtlSeconds: number;
    otpResendCooldownSeconds: number;
    otpMaxAttempts: number;
    otpMaxResends: number;
    otpMaxPerDestinationHour: number;
    passwordResetTtlMinutes: number;
  };
  throttle: { ttl: number; limit: number };
  booking: {
    /** Teto de criação de agendamento por IP, por hora. */
    createHourlyLimit: number;
    /** Gatilhos do OTP condicional do guest booking. */
    guestIpHourlyLimit: number;
    guestOpenAppointmentsLimit: number;
  };
  corsOrigins: string[];
  urls: {
    site: string;
    booking: string;
    dashboard: string;
    admin: string;
    /** Base do link público de agendamento, sem barra final. */
    publicBooking: string;
  };
  drivers: {
    notification: Env['NOTIFICATION_DRIVER'];
    payment: Env['PAYMENT_DRIVER'];
    mail: Env['MAIL_DRIVER'];
  };
}

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export function buildConfig(env: Env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';

  return {
    env: env.NODE_ENV,
    isProduction,
    port: env.API_PORT,
    prefix: env.API_PREFIX,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    auth: {
      cookieDomain: env.AUTH_COOKIE_DOMAIN || undefined,
      cookieSecure: isProduction,
      otpTtlSeconds: env.OTP_TTL_SECONDS,
      otpResendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      otpMaxAttempts: env.OTP_MAX_ATTEMPTS,
      otpMaxResends: env.OTP_MAX_RESENDS,
      otpMaxPerDestinationHour: env.OTP_MAX_PER_DESTINATION_HOUR,
      passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    },
    throttle: { ttl: env.THROTTLE_TTL, limit: env.THROTTLE_LIMIT },
    booking: {
      createHourlyLimit: env.BOOKING_CREATE_HOURLY_LIMIT,
      guestIpHourlyLimit: env.BOOKING_GUEST_IP_HOURLY_LIMIT,
      guestOpenAppointmentsLimit: env.BOOKING_GUEST_OPEN_LIMIT,
    },
    corsOrigins: [
      env.CORS_ORIGIN_SITE,
      env.CORS_ORIGIN_BOOKING,
      env.CORS_ORIGIN_DASHBOARD,
      env.CORS_ORIGIN_ADMIN,
    ],
    urls: {
      site: stripTrailingSlash(env.CORS_ORIGIN_SITE),
      booking: stripTrailingSlash(env.CORS_ORIGIN_BOOKING),
      dashboard: stripTrailingSlash(env.CORS_ORIGIN_DASHBOARD),
      admin: stripTrailingSlash(env.CORS_ORIGIN_ADMIN),
      publicBooking: stripTrailingSlash(env.PUBLIC_BOOKING_BASE_URL ?? env.CORS_ORIGIN_BOOKING),
    },
    drivers: {
      notification: env.NOTIFICATION_DRIVER,
      payment: env.PAYMENT_DRIVER,
      mail: env.MAIL_DRIVER,
    },
  };
}

export const CONFIG = 'APP_CONFIG';
