import type { Metadata } from 'next';
import { DashboardGuard } from '@/components/dashboard/dashboard-guard';
import { OnboardingEntry } from '@/components/dashboard/onboarding/onboarding-entry';

export const metadata: Metadata = {
  title: 'Configurar barbearia',
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    // `isOnboardingRoute`: sem isso o guard mandaria o dono de volta para cá
    // em laço, já que o wizard ainda não está concluído. Com o onboarding JÁ
    // concluído, o mesmo sinal faz o caminho inverso — o guard devolve ao
    // painel, porque o wizard não reabre depois de pronto (agente 30).
    <DashboardGuard isOnboardingRoute>
      <OnboardingEntry />
    </DashboardGuard>
  );
}
