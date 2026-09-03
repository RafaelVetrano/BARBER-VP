/**
 * Suíte unitária do frontend.
 *
 * Existe desde o agente 29 por duas defesas que NADA reprovava no CI e que
 * custam caro se quebrarem em silêncio:
 *
 *  1. A guarda de host do super admin no `middleware.ts` — `/admin/*` só
 *     responde no host do admin. Era verificada só à mão, com
 *     `curl -H "Host: ..."`, e é o que compensou a perda dos quatro deploys
 *     separados na fase 11.
 *  2. O interceptor de refresh de `packages/ui` — um 401 na PRÓPRIA rota de
 *     refresh não pode disparar outro refresh, sob pena de travar o visitante
 *     anônimo para sempre no skeleton da sessão.
 *
 * Ambiente `node`: nenhum dos dois toca no DOM. Testar componente React exige
 * jsdom + testing-library, que continua sendo dívida aberta.
 */
module.exports = {
  displayName: 'web',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/test/tsconfig.json' }],
  },
  // O `.next/standalone` guarda uma cópia do package.json e colide no haste map.
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
