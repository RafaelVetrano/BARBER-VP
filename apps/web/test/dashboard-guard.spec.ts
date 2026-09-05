import { resolveGuardAction, type GuardInput } from '@barbervp/ui';

/**
 * A REGRA DE PRODUTO DO AGENTE 30, no lado do navegador.
 *
 * "Concluir a configuração inicial é obrigatório para acessar o painel." Do
 * lado do servidor quem a faz valer é `POST /onboarding/complete`, coberto em
 * `onboarding.e2e-spec.ts`. Aqui se cobre o outro lado: para onde o guard manda
 * cada estado de sessão.
 *
 * Dois defeitos que estes casos travam, e que já estiveram no produto:
 *
 *  - o filho RENDERIZAVA durante o redirect. O guard antigo decidia num
 *    `useEffect` e devolvia `children` no mesmo passo, então `/app/agenda` com
 *    onboarding pendente chegava a montar e a disparar requisições antes de a
 *    navegação acontecer;
 *  - o wizard REABRIA depois de concluído. Quem digitasse `/app/configurar`
 *    com tudo pronto voltava para a tela de conclusão, não para o painel.
 *
 * A suíte roda em `node`, sem DOM — daí a decisão morar numa função pura.
 */
describe('DashboardGuard — a obrigatoriedade do wizard, do lado do navegador', () => {
  const base: GuardInput = {
    status: 'authenticated',
    onboardingDone: true,
    activeTenantId: 'tenant-a',
    isOnboardingRoute: false,
    completedOnEntry: true,
  };

  const guard = (patch: Partial<GuardInput> = {}) => resolveGuardAction({ ...base, ...patch });

  describe('sessão', () => {
    it('espera enquanto o refresh está em voo — não pisca o login', () => {
      expect(guard({ status: 'loading' })).toEqual({ kind: 'wait' });
    });

    it('manda o anônimo para o login', () => {
      expect(guard({ status: 'anonymous' })).toEqual({ kind: 'login' });
    });

    it('sessão sem barbearia ativa não é assunto deste guard', () => {
      // Quem resolve é o seletor de contexto; exigir onboarding aqui mandaria
      // para o wizard de uma barbearia que a sessão ainda não escolheu.
      expect(guard({ onboardingDone: null, activeTenantId: null })).toEqual({ kind: 'render' });
    });
  });

  describe('onboarding pendente', () => {
    const pending = { onboardingDone: false, completedOnEntry: false };

    it.each(['/app', '/app/agenda', '/app/clientes', '/app/configuracoes'])(
      'manda %s para o wizard, SEM renderizar a tela do painel',
      () => {
        const action = guard(pending);
        expect(action).toEqual({ kind: 'onboarding' });
        // O que importa é o que NÃO acontece: `render` aqui significaria a tela
        // do painel montando e chamando a API durante o redirect.
        expect(action.kind).not.toBe('render');
      },
    );

    it('deixa o próprio wizard renderizar — senão o redirect vira laço', () => {
      expect(guard({ ...pending, isOnboardingRoute: true })).toEqual({ kind: 'render' });
    });
  });

  describe('onboarding concluído', () => {
    it('o wizard não reabre: quem chega em /app/configurar volta ao painel', () => {
      expect(guard({ isOnboardingRoute: true, completedOnEntry: true })).toEqual({
        kind: 'dashboard',
      });
    });

    it('quem acabou de concluir CONTINUA na tela final', () => {
      // `completedOnEntry: false` é a fotografia de quem entrou com o wizard
      // pendente. Sem essa distinção, o `refresh()` do fim do passo 6 arrancaria
      // o dono da tela onde está o link público que ele veio buscar.
      expect(guard({ isOnboardingRoute: true, completedOnEntry: false })).toEqual({
        kind: 'render',
      });
    });

    it('as telas do painel abrem normalmente', () => {
      expect(guard()).toEqual({ kind: 'render' });
    });
  });
});
