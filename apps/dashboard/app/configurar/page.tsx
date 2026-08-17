import type { Metadata } from 'next';
import { DashboardGuard } from '../../components/dashboard-guard';
import { OnboardingWizard } from '../../components/onboarding/onboarding-wizard';

export const metadata: Metadata = {
  title: 'Configurar barbearia',
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    // `isOnboardingRoute`: sem isso o guard mandaria o dono de volta para cá
    // em laço, já que o wizard ainda não está concluído.
    <DashboardGuard isOnboardingRoute>
      <OnboardingWizard />
    </DashboardGuard>
  );
}
