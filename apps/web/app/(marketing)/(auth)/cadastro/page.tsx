import type { Metadata } from 'next';
import { AuthSplitLayout } from '@/components/marketing/auth/auth-split-layout';
import { BrandMark } from '@/components/marketing/auth/brand-mark';
import { DashboardMockup } from '@/components/marketing/auth/dashboard-mockup';
import { SignupForm } from '@/components/marketing/auth/signup-form';

export const metadata: Metadata = {
  title: 'Cadastre sua barbearia',
  description:
    'Crie a conta da sua barbearia no BarberVP: agenda online, financeiro e equipe. 7 dias grátis, sem cartão de crédito.',
  alternates: { canonical: '/cadastro' },
};

export default function SignupPage() {
  return (
    <AuthSplitLayout
      aside={
        <>
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 animate-bvp-fade-bg bg-gradient-to-br from-bg via-[#13171D] to-surface-2"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 opacity-50 bg-[repeating-linear-gradient(128deg,rgba(212,168,76,.045)_0_1px,transparent_1px_15px)]"
          />
          <span
            aria-hidden="true"
            className="absolute -left-40 -top-32 -z-10 size-[26rem] rounded-full bg-[radial-gradient(circle,rgba(212,168,76,.12),transparent_68%)] blur-lg"
          />

          <div className="flex items-start justify-between gap-4">
            <div className="max-w-md animate-bvp-rise">
              <h1 className="text-balance font-editorial text-[clamp(1.5rem,3.4vw,2.875rem)] font-semibold leading-tight tracking-tight text-fg">
                tudo pra você simplificar a sua gestão{' '}
                <em className="not-italic text-gold [font-style:italic]">em um só lugar.</em>
              </h1>
              <p className="mt-4 hidden max-w-sm text-base leading-relaxed text-fg-muted lg:block">
                A vida de quem toca uma barbearia é corrida — aqui, ela acontece em minutos.
              </p>
            </div>
            <BrandMark size="sm" className="shrink-0 lg:hidden" />
          </div>

          {/* O mockup flutuante só aparece onde há altura para ele. */}
          <div className="hidden flex-1 items-center justify-center py-6 lg:flex">
            <DashboardMockup />
          </div>

          <BrandMark className="hidden lg:inline-flex" />
        </>
      }
    >
      <div className="animate-bvp-in-left">
        <h2 className="mb-2 font-editorial text-[32px] font-semibold tracking-tight text-fg">
          Cadastre sua barbearia
        </h2>
        <p className="mb-7 text-[15px] text-fg-muted">7 dias grátis · sem cartão de crédito.</p>

        <SignupForm />
      </div>
    </AuthSplitLayout>
  );
}
