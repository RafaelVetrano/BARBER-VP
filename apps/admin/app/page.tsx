import { ApiStatus, PlaceholderScreen } from '@barbervp/ui';

export default function Page() {
  return (
    <PlaceholderScreen
      appName="apps/admin"
      title="Super Admin"
      description="Tenants, planos do SaaS, billing e impersonação auditada."
      nextPhase="fase 08"
    >
      <ApiStatus />
    </PlaceholderScreen>
  );
}
