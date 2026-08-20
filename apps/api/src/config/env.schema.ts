import { z } from 'zod';

/**
 * Validação de env no boot — a API não sobe com configuração inválida.
 * Falhar aqui é barato; falhar em produção com `JWT_SECRET` vazio não é.
 */

const port = z.coerce.number().int().min(1).max(65_535);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: port.default(3333),
  API_PREFIX: z.string().default('api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Segredos curtos são o vetor mais comum de comprometimento de JWT.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET precisa de ao menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET precisa de ao menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  /**
   * Domínio do cookie httpOnly de refresh. Vazio = host-only (o padrão em dev,
   * onde cada app roda numa porta de `localhost`). Em produção, `.barbervp.com.br`
   * para o cookie valer nos quatro subdomínios.
   */
  AUTH_COOKIE_DOMAIN: z.string().optional(),

  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  /**
   * Onde o rate limit conta.
   *
   * `redis` (padrão) é o único correto em produção: com N réplicas, contagem
   * em memória dá a cada uma o seu próprio teto, e o limite real vira N × o
   * configurado. `memory` existe para dois casos legítimos — uma instância só
   * sem Redis, e a suíte de teste, onde um contador compartilhado entre os
   * arquivos de spec derrubaria por 429 um login que o teste precisa fazer.
   */
  THROTTLE_STORAGE: z.enum(['redis', 'memory']).default('redis'),

  // Auth — limites agressivos por rota, acima do throttle global.
  /** Janela de validade do código OTP de 6 dígitos. */
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  /** Cooldown do "Reenviar código" — 59s, como no `ClienteAuth.dc.html`. */
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(59),
  /** Tentativas erradas antes de queimar o desafio. */
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /** Reenvios permitidos no mesmo desafio antes de exigir recomeçar. */
  OTP_MAX_RESENDS: z.coerce.number().int().positive().default(4),
  /** Desafios que um mesmo destino pode abrir por hora. */
  OTP_MAX_PER_DESTINATION_HOUR: z.coerce.number().int().positive().default(6),
  /** Validade do link de recuperação de senha do estabelecimento. */
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  // Booking público — calibração pedida pelo SPEC (fase 04). Os três são
  // deliberadamente frouxos com o cliente e apertados com o robô: a defesa de
  // verdade contra agenda lotada de graça é o OTP condicional, não o teto por
  // IP, que numa operadora de celular é compartilhado por milhares de pessoas.
  /** Reservas que um IP pode ABRIR por hora (429 acima disso). */
  BOOKING_CREATE_HOURLY_LIMIT: z.coerce.number().int().positive().default(30),
  /** Reservas de visitante por IP/hora antes de passar a exigir código. */
  BOOKING_GUEST_IP_HOURLY_LIMIT: z.coerce.number().int().positive().default(6),
  /** Horários futuros em aberto por telefone antes de exigir código. */
  BOOKING_GUEST_OPEN_LIMIT: z.coerce.number().int().positive().default(2),

  // CORS por origem explícita — uma por app, sem wildcard.
  CORS_ORIGIN_SITE: z.string().url(),
  CORS_ORIGIN_BOOKING: z.string().url(),
  CORS_ORIGIN_DASHBOARD: z.string().url(),
  CORS_ORIGIN_ADMIN: z.string().url(),

  /**
   * Base do link público de agendamento (`{base}/agendar/{slug}`). Sem valor,
   * cai em `CORS_ORIGIN_BOOKING` — é o mesmo host em dev.
   */
  PUBLIC_BOOKING_BASE_URL: z.string().url().optional(),

  NOTIFICATION_DRIVER: z.enum(['mock']).default('mock'),
  PAYMENT_DRIVER: z.enum(['mock']).default('mock'),
  MAIL_DRIVER: z.enum(['mock']).default('mock'),
  /** Provedor de LLM do Assistente IA ("Navalha") — só `mock` nesta fase (SPEC → fora de escopo). */
  AI_ASSISTANT_DRIVER: z.enum(['mock']).default('mock'),

  /** Cobranças recusadas SEGUIDAS até o super admin suspender o tenant automaticamente (fase 08). */
  BILLING_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // Filas BullMQ (fase 09).
  /**
   * Liga os WORKERS. Desligado, a API continua enfileirando e o painel de jobs
   * continua lendo a fila — só ninguém consome. É assim que se separa web de
   * worker em produção (réplica de API com `false`, réplica de worker com
   * `true`) e é assim que a suíte de teste evita que um worker de fundo mexa
   * no banco no meio de um caso.
   */
  QUEUE_WORKERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** De quanto em quanto tempo o outbox de notificação é varrido (segundos). */
  QUEUE_OUTBOX_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  /** Hora local (0–23) do job diário de renovação de assinatura do cliente. */
  QUEUE_SUBSCRIPTION_RENEWAL_HOUR: z.coerce.number().int().min(0).max(23).default(3),
  /** Hora local (0–23) do job diário do ciclo de billing do SaaS. */
  QUEUE_SAAS_BILLING_HOUR: z.coerce.number().int().min(0).max(23).default(4),
  /** Hora local (0–23) da faxina de OTP/sessões expiradas. */
  QUEUE_MAINTENANCE_HOUR: z.coerce.number().int().min(0).max(23).default(5),
  /** Fuso usado pelos cron dos jobs diários. */
  QUEUE_TIMEZONE: z.string().default('America/Sao_Paulo'),
});

/** Todas as chaves de ambiente conhecidas — derivadas do próprio schema. */
export const ENV_KEYS = Object.keys(envSchema.shape) as Array<keyof Env>;

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  · ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }

  return parsed.data;
}
