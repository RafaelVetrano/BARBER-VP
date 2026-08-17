import { ApiStatus, PlaceholderScreen } from '@barbervp/ui';

export default function Page() {
  return (
    <PlaceholderScreen
      appName="apps/site"
      title="Site institucional"
      description="Landing de vendas do SaaS, cadastro e login de estabelecimento."
      nextPhase="fase 02 (design system) e fase 03 (auth)"
    >
      <ApiStatus />
    </PlaceholderScreen>
  );
}
