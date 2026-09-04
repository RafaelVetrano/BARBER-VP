import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RESERVED_SLUG_LIST } from './slug.service';

/**
 * A lista de slugs reservados contra as ROTAS REAIS do frontend.
 *
 * Desde a fase 11 as quatro superfícies compartilham uma árvore de rotas, e no
 * Next a rota estática ganha da dinâmica: uma barbearia com slug `cadastro`
 * nunca abriria, porque `/cadastro` é a tela de cadastro. O bloqueio já
 * existia; o que faltava era alguém reprovar quando uma ROTA NOVA nascesse sem
 * entrar na lista — foi assim que `cadastro`, `recuperar-senha` e
 * `privacidade` ficaram de fora por várias fases.
 *
 * Este caso lê o diretório de rotas de verdade. Rota nova fora de
 * `(dashboard)`/`(admin)` reprova aqui até ser reservada.
 */
describe('slugs reservados × rotas do frontend', () => {
  const APP_DIR = join(__dirname, '../../../../apps/web/app');

  /**
   * Segmentos de primeiro nível que viram URL na raiz. Grupos entre
   * parênteses não entram na URL, então são atravessados; `[slug]` é a própria
   * rota dinâmica que estamos protegendo.
   */
  function topLevelRoutes(dir: string): string[] {
    const found: string[] = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      // Grupo de rota: não aparece na URL, desce um nível.
      if (entry.name.startsWith('(') && entry.name.endsWith(')')) {
        found.push(...topLevelRoutes(join(dir, entry.name)));
        continue;
      }
      // A rota dinâmica é o alvo da proteção, não uma concorrente.
      if (entry.name.startsWith('[') || entry.name.startsWith('_')) continue;

      found.push(entry.name);
    }

    return found;
  }

  it('toda rota estática na raiz do frontend está reservada', () => {
    // O teste roda a partir de `apps/api`; sem o monorepo por perto (build
    // isolado da Railway) não há o que comparar.
    if (!existsSync(APP_DIR)) {
      return;
    }

    const routes = topLevelRoutes(APP_DIR);
    expect(routes.length).toBeGreaterThan(0);

    const missing = routes.filter((route) => !RESERVED_SLUG_LIST.includes(route));

    expect(missing).toEqual([]);
  });

  it('as rotas que já sequestraram slug seguem reservadas', () => {
    // Guarda explícita: mesmo que a varredura acima falhe em achar o diretório,
    // estas quatro não podem sair da lista.
    for (const slug of ['entrar', 'cadastro', 'agendar', 'recuperar-senha']) {
      expect(RESERVED_SLUG_LIST).toContain(slug);
    }
  });
});
