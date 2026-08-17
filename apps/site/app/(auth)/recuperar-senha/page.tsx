import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@barbervp/ui';
import { AuthSplitLayout } from '../../../components/auth/auth-split-layout';
import { BrandMark } from '../../../components/auth/brand-mark';
import { RecoverPasswordForm } from '../../../components/auth/recover-password-form';

export const metadata: Metadata = {
  title: 'Recuperar senha',
  description: 'Redefina a senha do painel da sua barbearia no BarberVP.',
  // A página de recuperação não tem valor de busca e carrega token na URL.
  robots: { index: false, follow: false },
};

export default function RecoverPasswordPage() {
  return (
    <AuthSplitLayout
      asideWidth="50"
      aside={
        <>
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_18%_0%,#2A303A,#12151A_52%,#0B0D11_100%)]"
          />
          <BrandMark />
          <p className="max-w-sm font-display text-[clamp(1.25rem,2.6vw,2rem)] font-bold leading-tight tracking-tight text-fg">
            Recupere seu acesso e volte ao <span className="text-gold">controle</span>.
          </p>
        </>
      }
    >
      <div className="animate-bvp-up">
        <h1 className="mb-2 font-display text-[28px] font-bold tracking-tight text-fg">
          Recuperar senha
        </h1>

        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <RecoverPasswordForm />
        </Suspense>
      </div>
    </AuthSplitLayout>
  );
}
