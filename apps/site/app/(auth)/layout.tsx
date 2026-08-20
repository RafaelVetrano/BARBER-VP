import { Providers } from '../providers';

/**
 * Providers de cliente ficam AQUI, e não no layout raiz, por causa da landing.
 *
 * O `EstablishmentAuthProvider` tenta um refresh silencioso ao montar — o que
 * faz todo sentido nestas três telas (quem tem cookie válido não vê o login
 * piscar) e nenhum na `/`: o visitante da landing é anônimo por definição, e o
 * provider disparava três `POST /auth/refresh` que só podiam dar 401, antes da
 * página ficar interativa, na única página do produto cuja velocidade decide
 * se alguém vira cliente.
 *
 * O grupo `(auth)` cobre `/entrar`, `/cadastro` e `/recuperar-senha`. Rota nova
 * que precise de sessão, toast ou React Query entra neste grupo — ou ganha o
 * seu próprio layout com os providers.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
