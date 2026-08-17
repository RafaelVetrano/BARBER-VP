import { validateEnv } from './env.schema';

const VALID = {
  DATABASE_URL: 'postgresql://user:pwd@localhost:5432/db?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  CORS_ORIGIN_SITE: 'http://localhost:3000',
  CORS_ORIGIN_BOOKING: 'http://localhost:3001',
  CORS_ORIGIN_DASHBOARD: 'http://localhost:3002',
  CORS_ORIGIN_ADMIN: 'http://localhost:3003',
};

describe('validação de env', () => {
  it('aceita a configuração mínima e aplica defaults', () => {
    const env = validateEnv({ ...VALID });

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3333);
    expect(env.API_PREFIX).toBe('api/v1');
  });

  it('recusa segredo de JWT curto', () => {
    expect(() => validateEnv({ ...VALID, JWT_ACCESS_SECRET: 'curto' })).toThrow(
      /ao menos 32 caracteres/,
    );
  });

  it('recusa boot sem DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...semBanco } = VALID;
    expect(() => validateEnv(semBanco)).toThrow(/DATABASE_URL/);
  });

  it('recusa origem de CORS que não é URL', () => {
    expect(() => validateEnv({ ...VALID, CORS_ORIGIN_ADMIN: '*' })).toThrow(/CORS_ORIGIN_ADMIN/);
  });
});
