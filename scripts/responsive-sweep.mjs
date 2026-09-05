#!/usr/bin/env node
/**
 * Varredura responsiva das 4 SUPERFÍCIES nos 5 tamanhos de referência do SPEC
 * (360 · 390 · 768 · 1024 · 1440).
 *
 * Desde a fase 11 as quatro vivem num app só (`apps/web`, porta 3000),
 * separadas por prefixo de rota — a varredura continua organizada por
 * superfície porque é assim que se lê o resultado.
 *
 * Fecha a dívida arrastada desde a fase 02 ("sem teste de frontend
 * automatizado"): até aqui, responsividade era conferida LENDO classes
 * Tailwind. Isto abre a página de verdade e mede o layout renderizado.
 *
 * O que reprova:
 *   · rolagem horizontal — `scrollWidth` maior que a viewport, o sintoma
 *     clássico de tabela/grade que não cabe no celular;
 *   · alvo de toque menor que 44×44 CSS px abaixo de 768, o mínimo das WCAG
 *     para dedo (só nos dois tamanhos de celular: no desktop há mouse);
 *   · erro de console da própria página.
 *
 * Um elemento pode transbordar de propósito — é o caso de um contêiner com
 * `overflow-x: auto`, que rola por dentro sem empurrar a página. Por isso a
 * medida é do `documentElement`, não de cada filho.
 *
 * Uso:
 *   node scripts/responsive-sweep.mjs                 # tudo, se o web estiver de pé
 *   node scripts/responsive-sweep.mjs --app=admin     # só uma superfície
 *   node scripts/responsive-sweep.mjs --json          # saída para CI
 */

import { launch } from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ??
  ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(Boolean);

/** Os 5 tamanhos de referência do SPEC. */
const VIEWPORTS = [
  { name: '360 (celular pequeno)', width: 360, height: 780, mobile: true },
  { name: '390 (celular)', width: 390, height: 844, mobile: true },
  { name: '768 (tablet)', width: 768, height: 1024, mobile: false },
  { name: '1024 (tablet largo)', width: 1024, height: 768, mobile: false },
  { name: '1440 (desktop)', width: 1440, height: 900, mobile: false },
];

/**
 * Rotas de cada superfície. As telas atrás de login entram porque uma sessão
 * só cobre painel e admin (mesma audiência de estabelecimento).
 */
const API = process.env.API_URL ?? 'http://localhost:3333/api/v1';

/** Contas do seed (`prisma/seed.ts`). */
const CREDENTIALS = {
  admin: { email: 'admin@barbervp.com.br', password: 'BarberVP@2026' },
  owner: { email: 'dono@barbeariacentral.com.br', password: 'BarberVP@2026' },
  /**
   * Dona da barbearia com o onboarding PENDENTE (`seedOnboardingTenant`) — a
   * única conta pela qual o wizard abre, já que o guard devolve ao painel quem
   * já concluiu.
   */
  onboardingOwner: { email: 'dono@barbeariaconfiguracao.com.br', password: 'BarberVP@2026' },
};

/** Frontend único (fase 11): uma porta só, quatro prefixos. */
const WEB_PORT = Number(process.env.WEB_PORT ?? 3000);

const APPS = {
  site: {
    port: WEB_PORT,
    routes: ['/', '/entrar', '/cadastro', '/recuperar-senha'],
  },
  booking: {
    port: WEB_PORT,
    routes: ['/agendar', `/${process.env.DEMO_SLUG ?? 'barbearia-central'}`],
  },
  dashboard: {
    port: WEB_PORT,
    login: CREDENTIALS.owner,
    routes: [
      '/app',
      '/app/agenda',
      '/app/clientes',
      // As três sub-abas do catálogo medem layouts diferentes: tabela de 6
      // colunas, tabela de 7 e a grade 2×1 da calculadora (fase 23).
      '/app/servicos-produtos?tab=servicos',
      '/app/servicos-produtos?tab=produtos',
      '/app/servicos-produtos?tab=calculadora',
      // As três visões da Equipe medem layouts diferentes: a grade de cards,
      // a matriz 7 colunas da escala (rola por dentro) e as linhas de convite.
      '/app/equipe?tab=equipe',
      '/app/equipe?tab=escala',
      '/app/equipe?tab=convites',
      '/app/comandas',
      '/app/financeiro',
      '/app/comissoes',
      '/app/fidelidade',
      '/app/relatorios',
      '/app/whatsapp',
      '/app/assistente-ia',
      // As quatro sub-abas de Configurações medem layouts diferentes: o
      // formulário de 720px com a linha de horário (que tem 6 controles numa
      // linha só no desktop), a tabela de unidades, a grade de planos com
      // `auto-fit` e o painel de preferências (fase 26).
      '/app/configuracoes?tab=barbearia',
      '/app/configuracoes?tab=unidades',
      '/app/configuracoes?tab=plano',
      '/app/configuracoes?tab=preferencias',
      '/app/minha-pagina',
      '/app/meu-perfil',
    ],
    /*
     * O `/playground` é a galeria de componentes da fase 02, não uma tela de
     * produto: ele renderiza os primitives isolados e em estados de
     * demonstração (inclusive tamanhos pequenos de propósito), então a régua
     * de alvo de toque não se aplica. O layout dele continua sendo medido.
     */
    layoutOnly: ['/app/playground'],
  },
  admin: {
    port: WEB_PORT,
    login: CREDENTIALS.admin,
    routes: [
      '/admin/tenants',
      '/admin/planos',
      '/admin/billing',
      '/admin/metricas',
      '/admin/filas',
      '/admin/mensagens',
    ],
  },
};

/**
 * Faz login DENTRO do navegador para que a varredura veja as telas reais, e
 * não a tela de login.
 *
 * O refresh token é um cookie httpOnly de `localhost`; cookie ignora porta,
 * então o que a API (3333) grava vale para o app (3000). Feito o login, o
 * provider de auth da superfície renova o access token sozinho ao montar.
 */
async function login(page, port, credentials) {
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

  const ok = await page.evaluate(
    async (api, creds) => {
      const response = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(creds),
      });
      return response.ok;
    },
    API,
    credentials,
  );

  return ok;
}

const args = process.argv.slice(2);
const onlyApp = args.find((arg) => arg.startsWith('--app='))?.split('=')[1];
const asJson = args.includes('--json');

/**
 * Pausa entre rotas.
 *
 * A varredura abre dezenas de telas em segundos, e cada tela do dashboard
 * dispara várias chamadas à API — um padrão que nenhum usuário real produz e
 * que estoura o rate limit. Sem esta pausa, tudo depois da primeira rajada
 * mede a tela de erro do Next em vez do layout. Ver `--rate-limit` no
 * README de deploy.
 */
const ROUTE_DELAY_MS = Number(
  args.find((arg) => arg.startsWith('--delay='))?.split('=')[1] ?? 2_500,
);

const findings = [];
const log = (message) => {
  if (!asJson) {
    console.log(message);
  }
};

/** Uma superfície só entra na varredura se o app estiver realmente no ar. */
async function isUp(port) {
  try {
    const response = await fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(4_000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * O que se mede DENTRO da página, nos 5 tamanhos.
 *
 * Virou constante no agente 30 para ser reusada pela varredura por rota e
 * pela varredura do wizard, que mede a MESMA página em seis estados.
 */
const MEASURE = (minTouch) => {
  const doc = document.documentElement;
  const overflowBy = doc.scrollWidth - doc.clientWidth;

  /** Quem, concretamente, é mais largo que a viewport. */
  const culprits = [];
  if (overflowBy > 0) {
    for (const element of document.querySelectorAll('body *')) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= doc.clientWidth + 1) continue;
      // Um contêiner que rola por dentro não é problema.
      const style = getComputedStyle(element);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
      culprits.push(
        `${element.tagName.toLowerCase()}.${String(element.className || '').slice(0, 60)}`,
      );
      if (culprits.length >= 3) break;
    }
  }

  const smallTargets = [];
  if (minTouch) {
    const interactive = document.querySelectorAll(
      'button, a[href], input, select, textarea, [role="button"], [role="tab"]',
    );
    for (const element of interactive) {
      let rect = element.getBoundingClientRect();

      /*
       * Caixa de seleção e rádio são desenhados pequenos de
       * propósito; quem recebe o toque é o `<label>` em volta, que
       * é bem maior. Medir o input puniria um padrão correto — o
       * alvo real é o rótulo.
       */
      /*
       * Exceção "inline" das WCAG 2.5.8: um link no meio de uma
       * frase ("aceito os <a>termos de uso</a>") é dimensionado
       * pelo texto e não tem como crescer sem quebrar o parágrafo.
       * A régua vale para controle que se sustenta sozinho.
       */
      if (element.tagName === 'A') {
        const parent = element.parentElement;
        const hasSiblingText = Array.from(parent?.childNodes ?? []).some(
          (node) => node.nodeType === 3 && node.textContent.trim().length > 0,
        );
        if (hasSiblingText) continue;
      }

      const type = element.getAttribute('type');
      if (type === 'checkbox' || type === 'radio') {
        const label =
          element.closest('label') ??
          (element.id
            ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
            : null);
        if (label) {
          rect = label.getBoundingClientRect();
        }
      }

      if (rect.width === 0 || rect.height === 0) continue;
      if (getComputedStyle(element).visibility === 'hidden') continue;
      if (rect.width < 44 || rect.height < 44) {
        smallTargets.push(
          `${element.tagName.toLowerCase()}"${(element.textContent || '').trim().slice(0, 24)}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        );
        if (smallTargets.length >= 5) break;
      }
    }
  }

  /*
   * A tela de erro do Next tem layout próprio e mediria tudo
   * errado. Detectá-la evita reportar "alvo de toque pequeno"
   * quando o que houve foi a página não carregar.
   */
  const errorOverlay =
    document.querySelector('nextjs-portal') !== null ||
    /Checking the proxy|Unhandled Runtime Error|Application error/i.test(
      document.body.innerText.slice(0, 400),
    );

  return { overflowBy, culprits, smallTargets, errorOverlay };
};

/**
 * Erros de console da página, filtrados.
 *
 * 401/403 numa rota protegida é o guard funcionando, não defeito de layout — e
 * é o que se vê na tela de login, que também é varrida.
 */
function watchConsole(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/\b(401|403)\b/.test(text)) return;
    errors.push(text.slice(0, 200));
  });
  return errors;
}

/**
 * Mede a página aberta nos 5 tamanhos, redimensionando (não recarregando).
 *
 * `label` é o que aparece no relatório: normalmente a rota, mas para o wizard é
 * `/app/configurar (passo 3 de 6)` — a lição do #9 da fase 13 é que verde de
 * varredura não prova que a tela CERTA foi medida, e um rótulo por passo é o
 * que torna isso auditável na saída.
 */
async function measureViewports(page, { app, label, checkTouchTargets, consoleErrors }) {
  for (const viewport of VIEWPORTS) {
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      deviceScaleFactor: 1,
    });
    // Folga para o reflow assentar antes de medir.
    await new Promise((resolve) => setTimeout(resolve, 350));

    const before = consoleErrors.length;

    const result = await page.evaluate(MEASURE, viewport.mobile && checkTouchTargets);

    const problems = [];
    if (result.overflowBy > 0) {
      problems.push(
        `rolagem horizontal (+${result.overflowBy}px): ${result.culprits.join(', ') || 'origem não identificada'}`,
      );
    }
    if (result.smallTargets.length > 0) {
      problems.push(`alvo de toque < 44px: ${result.smallTargets.join(' · ')}`);
    }
    const newErrors = consoleErrors.slice(before);
    if (newErrors.length > 0) {
      problems.push(`erro de console: ${newErrors[0]}`);
    }
    if (result.errorOverlay) {
      problems.push(
        'a página não renderizou (tela de erro do Next). Se veio junto de um 429, ' +
          'é o rate limit da API reagindo à varredura — use --delay maior.',
      );
    }

    if (problems.length === 0) {
      log(`   ✓ ${label} @ ${viewport.name}`);
    } else {
      log(`   ✗ ${label} @ ${viewport.name}`);
      for (const problem of problems) {
        log(`       ${problem}`);
        findings.push({ app, route: label, viewport: viewport.name, problem });
      }
    }
  }
}

/**
 * O wizard de configuração — os SEIS passos, um a um.
 *
 * **Por que ele precisa de tratamento próprio.** `/app/configurar` é uma rota
 * só, e o passo é estado do cliente: abrir a URL seis vezes mediria seis vezes
 * o passo 1. É a lição do #9 da fase 13 — verde de varredura não prova que a
 * tela CERTA foi medida — aplicada ao caso em que ela mais dói, porque o
 * wizard é agora a PORTA do produto (agente 30: concluir é obrigatório).
 *
 * **Por que `?passo=N` e não clicar em "Continuar".** Trocar a viewport
 * RECARREGA a página (o Chrome refaz a emulação ao ligar/desligar `isMobile`),
 * e um passo alcançado por clique não sobrevive ao recarregamento — a medição
 * do 360 mostraria o passo 3 e a do 768, as boas-vindas. Com o passo na URL,
 * cada um é uma rota como qualquer outra e as cinco medidas são do mesmo lugar.
 *
 * **Por que uma conta própria.** O dono do seed já concluiu o onboarding, e
 * desde o agente 30 o guard manda quem concluiu de volta ao painel — abrir o
 * wizard com ele mediria o dashboard. A varredura entra como a dona de
 * `barbearia-configuracao`, a fixture que `make seed` deixa no passo 0.
 * Registrar uma conta a cada execução não serviria: `POST /auth/register` é
 * limitado a 5 por hora, e a varredura passaria a depender de quantas vezes
 * rodou.
 *
 * A varredura só MEDE: não salva passo nenhum e não conclui o wizard.
 */
async function sweepWizard(browser) {
  const port = WEB_PORT;
  if (!(await isUp(port))) {
    log(`\n⏭  wizard — app fora do ar na porta ${port}, pulando`);
    return;
  }

  log(`\n▸ wizard — /app/configurar, os 6 passos (porta ${port})`);

  const authPage = await browser.newPage();
  const ok = await login(authPage, port, CREDENTIALS.onboardingOwner);
  await authPage.close();
  if (!ok) {
    log('   ! login da fixture de onboarding falhou — rode `make seed`');
    findings.push({
      app: 'wizard',
      route: '/app/configurar',
      viewport: 'todos',
      problem: 'login da fixture de onboarding falhou (rode `make seed`)',
    });
    return;
  }

  // Sem `?passo`, a fixture (passo 0) abre nas boas-vindas — a primeira tela do
  // produto, e de onde saiu o "Pular e explorar o painel" (agente 30).
  const routes = [
    '/app/configurar',
    ...Array.from({ length: 6 }, (_, index) => `/app/configurar?passo=${index + 1}`),
  ];

  for (const route of routes) {
    const page = await browser.newPage();
    const consoleErrors = watchConsole(page);

    try {
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.goto(`http://localhost:${port}${route}`, {
        waitUntil: 'networkidle2',
        timeout: 45_000,
      });
      // O wizard é CSR e ainda pede `GET /onboarding` antes de desenhar o passo.
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      await measureViewports(page, {
        app: 'wizard',
        label: route,
        checkTouchTargets: true,
        consoleErrors,
      });

      if (consoleErrors.length > 0 && !findings.some((f) => f.route === route)) {
        log(`   ✗ ${route} — erro de console na carga: ${consoleErrors[0]}`);
        findings.push({ app: 'wizard', route, viewport: 'carga', problem: consoleErrors[0] });
      }
    } catch (error) {
      log(`   ! ${route} — ${error.message}`);
      findings.push({ app: 'wizard', route, viewport: 'todos', problem: error.message });
    } finally {
      await page.close();
    }

    if (ROUTE_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, ROUTE_DELAY_MS));
    }
  }
}

async function sweep() {
  if (!CHROME) {
    console.error('Chrome não encontrado. Defina CHROME_PATH.');
    process.exit(2);
  }

  const browser = await launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const [app, config] of Object.entries(APPS)) {
      if (onlyApp && app !== onlyApp) {
        continue;
      }
      if (!(await isUp(config.port))) {
        log(`\n⏭  ${app} — app fora do ar na porta ${config.port}, pulando`);
        continue;
      }

      log(`\n▸ ${app} (porta ${config.port})`);

      if (config.login) {
        const authPage = await browser.newPage();
        const ok = await login(authPage, config.port, config.login);
        await authPage.close();
        if (!ok) {
          log(`   ! login falhou — as rotas protegidas vão cair na tela de login`);
        }
      }

      for (const route of [...config.routes, ...(config.layoutOnly ?? [])]) {
        const url = `http://localhost:${config.port}${route}`;
        const checkTouchTargets = !(config.layoutOnly ?? []).includes(route);

        /*
         * UMA navegação por rota, e os 5 tamanhos medidos redimensionando a
         * mesma página.
         *
         * Recarregar a cada tamanho fazia 30 navegações em poucos segundos por
         * app; o provider de auth dispara um `/auth/refresh` a cada montagem, e
         * a rajada estourava o rate limit — a varredura media a própria tela de
         * erro em vez do layout. Redimensionar também é a medida mais fiel: é o
         * reflow por breakpoint que se quer verificar, e o layout é CSS
         * (Tailwind `md:`/`lg:`), não JavaScript de largura.
         */
        const page = await browser.newPage();
        const consoleErrors = watchConsole(page);

        try {
          await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 });
          // As telas são CSR: sem esta folga, mede-se o esqueleto.
          await new Promise((resolve) => setTimeout(resolve, 1_200));

          await measureViewports(page, { app, label: route, checkTouchTargets, consoleErrors });
          // Erros que apareceram durante a carga inicial contam uma vez só.
          if (consoleErrors.length > 0 && !findings.some((f) => f.route === route)) {
            log(`   ✗ ${route} — erro de console na carga: ${consoleErrors[0]}`);
            findings.push({ app, route, viewport: 'carga', problem: consoleErrors[0] });
          }
        } catch (error) {
          log(`   ! ${route} — ${error.message}`);
          findings.push({ app, route, viewport: 'todos', problem: error.message });
        } finally {
          await page.close();
        }

        if (ROUTE_DELAY_MS > 0) {
          await new Promise((resolve) => setTimeout(resolve, ROUTE_DELAY_MS));
        }
      }
    }

    if (!onlyApp || onlyApp === 'wizard') {
      await sweepWizard(browser);
    }
  } finally {
    await browser.close();
  }

  if (asJson) {
    console.log(JSON.stringify({ findings }, null, 2));
  } else {
    log(
      findings.length === 0
        ? '\n✅ Varredura responsiva sem pendências nos 5 tamanhos.'
        : `\n❌ ${findings.length} pendência(s) responsiva(s).`,
    );
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

await sweep();
