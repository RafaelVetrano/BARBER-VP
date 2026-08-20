import { EstablishmentProviders } from '../../providers';

/**
 * Providers de cliente ficam AQUI, e não no layout de `(marketing)`, por causa
 * da landing — ver o comentário do layout do grupo.
 *
 * O grupo `(auth)` cobre `/entrar`, `/cadastro` e `/recuperar-senha`. Rota nova
 * que precise de sessão, toast ou React Query entra neste grupo — ou ganha o
 * seu próprio layout com os providers.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <EstablishmentProviders>{children}</EstablishmentProviders>;
}
