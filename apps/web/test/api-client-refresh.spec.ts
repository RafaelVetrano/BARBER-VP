import type { AxiosInstance } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { createApiClient } from '@barbervp/ui';

/**
 * O DEADLOCK DO REFRESH — o defeito mais grave que a fase 11 deixou em aberto.
 *
 * Um visitante ANÔNIMO que abria `/app` ou `/admin` ficava preso para sempre
 * no skeleton "Carregando sua sessão…", em vez de ir para `/entrar`.
 *
 * Mecanismo: o bootstrap do `EstablishmentAuthProvider` chamava
 * `POST /auth/refresh` pelo MESMO axios que tem o interceptor. Sem cookie
 * válido dava 401; o interceptor preenchia `refreshInFlight` com
 * `options.refreshTokens()` — que É a mesma função de refresh — e ela
 * disparava outro `POST /auth/refresh`, tomava outro 401, reentrava no
 * interceptor e, com `refreshInFlight` já preenchido, dava `await` na promise
 * que só resolveria quando ela própria terminasse. Ninguém rejeitava: o
 * `catch` do provider nunca rodava, `clearSession()` nunca era chamado e
 * `status` ficava em `'loading'` — o estado em que os guardas mostram skeleton
 * e não redirecionam.
 *
 * Assinatura no navegador: exatamente 2 `401 /auth/refresh` por montagem
 * (4 com StrictMode) e depois silêncio absoluto.
 *
 * O caso decisivo é o primeiro: ele TRAVAVA antes da correção, e o
 * `jest.setTimeout` do arquivo é o que separa "resolveu" de "pendurou".
 */
describe('interceptor de refresh — o anônimo não pode travar na porta do painel', () => {
  jest.setTimeout(5_000);

  let client: AxiosInstance;
  let mock: MockAdapter;
  let refreshCalls: number;
  let unauthorized: number;

  /** Reproduz o arranjo real: `refreshTokens` chama a rota de refresh pelo MESMO client. */
  function setup() {
    refreshCalls = 0;
    unauthorized = 0;

    client = createApiClient({
      baseURL: 'http://api.test/api/v1',
      refreshTokens: async () => {
        // É exatamente o que `establishmentApi.refresh(client)` faz.
        await client.post('/auth/refresh');
      },
      onUnauthorized: () => {
        unauthorized += 1;
      },
    });

    mock = new MockAdapter(client);
    mock.onPost('/auth/refresh').reply(() => {
      refreshCalls += 1;
      return [401, { code: 'UNAUTHORIZED', message: 'sem sessão' }];
    });
  }

  beforeEach(setup);
  afterEach(() => mock.restore());

  it('o 401 da PRÓPRIA rota de refresh rejeita, em vez de pendurar', async () => {
    // Antes da correção esta linha nunca resolvia — nem resolvida, nem
    // rejeitada — e o teste morria no timeout.
    await expect(client.post('/auth/refresh')).rejects.toMatchObject({ status: 401 });

    // Uma só ida à rede: o interceptor não tentou renovar a renovação.
    expect(refreshCalls).toBe(1);
    // E avisou o provider, que é quem chama `clearSession()` e libera o guarda.
    expect(unauthorized).toBe(1);
  });

  it('sem sessão, uma rota protegida propaga o 401 em vez de travar', async () => {
    mock.onGet('/dashboard/overview').reply(401, { code: 'UNAUTHORIZED', message: 'sem sessão' });

    await expect(client.get('/dashboard/overview')).rejects.toMatchObject({ status: 401 });

    // Tentou renovar UMA vez (o caminho legítimo), falhou, e desistiu.
    expect(refreshCalls).toBe(1);
    expect(unauthorized).toBeGreaterThanOrEqual(1);
  });

  it('a mesma guarda vale para o refresh da área do cliente', async () => {
    mock.onPost('/client-auth/refresh').reply(401, { code: 'UNAUTHORIZED', message: 'sem sessão' });

    await expect(client.post('/client-auth/refresh')).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(0);
  });

  it('com sessão renovável, o 401 de uma rota protegida ainda é retentado', async () => {
    // O caminho de quem TEM sessão não pode ter sido quebrado pela guarda.
    mock.reset();
    let refreshed = false;
    mock.onPost('/auth/refresh').reply(() => {
      refreshed = true;
      return [200, { accessToken: 'novo' }];
    });
    mock.onGet('/dashboard/overview').reply(() => (refreshed ? [200, { ok: true }] : [401, { code: 'UNAUTHORIZED', message: 'expirado' }]));

    const response = await client.get('/dashboard/overview');

    expect(response.data).toEqual({ ok: true });
    expect(refreshed).toBe(true);
    expect(unauthorized).toBe(0);
  });
});
