import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carrega o `.env` (do app ou da raiz) antes dos testes que tocam banco.
 * Sem dependência de `dotenv`: o parser precisa cobrir só `CHAVE=valor`.
 */
const CANDIDATES = [
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../../.env'),
  resolve(__dirname, '../../../.env.example'),
];

const envFile = CANDIDATES.find((path) => existsSync(path));

if (envFile) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (key && process.env[key] === undefined) {
      process.env[key] = rawValue!.replace(/^["']|["']$/g, '');
    }
  }
}

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';

/**
 * Limites do booking afrouxados NA SUÍTE.
 *
 * Uma suíte de e2e faz, do mesmo IP e em segundos, o que um cliente faria em
 * semanas: os tetos de produção a derrubariam no meio, e afrouxá-los no código
 * para o teste passar seria trocar segurança por conveniência. Os gatilhos em
 * si continuam cobertos — `REGISTERED_PHONE` no próprio e2e (que independe de
 * IP) e `TOO_MANY_OPEN`/`IP_BURST` no unitário do `GuestRiskService`.
 */
process.env.BOOKING_CREATE_HOURLY_LIMIT = '2000';
process.env.BOOKING_GUEST_IP_HOURLY_LIMIT = '2000';
process.env.BOOKING_GUEST_OPEN_LIMIT = '2000';

/**
 * Workers DESLIGADOS na suíte.
 *
 * Cada `*.e2e-spec.ts` sobe a aplicação inteira em processo; com os workers
 * ligados, cada uma dessas instâncias abriria os quatro workers BullMQ e o
 * dreno do outbox passaria a mexer no banco no meio dos casos — um teste que
 * afirma "a mensagem ficou PENDING" falharia por causa de um job de fundo, e
 * não por causa do código sob teste. Os jobs têm cobertura própria em
 * `queue.e2e-spec.ts`, que chama os serviços diretamente.
 */
process.env.QUEUE_WORKERS_ENABLED = 'false';

/**
 * Rate limit contado em MEMÓRIA na suíte.
 *
 * Em produção a contagem é no Redis (senão cada réplica teria o seu teto), mas
 * ali ela também sobrevive entre execuções e é compartilhada por todos os
 * arquivos de spec: os ~30 logins que a suíte faz em segundos estouram o
 * `@Throttle({ limit: 10 })` de `/auth/login` e derrubam testes que não têm
 * nada a ver com rate limit. Em memória, cada app de teste começa do zero — o
 * comportamento que a suíte teve das fases 03 a 08.
 *
 * O caminho Redis continua coberto por `hardening.e2e-spec.ts`, que liga o
 * storage explicitamente e confere que o contador é compartilhado.
 */
process.env.THROTTLE_STORAGE = 'memory';
