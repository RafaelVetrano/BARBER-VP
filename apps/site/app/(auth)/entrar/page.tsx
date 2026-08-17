import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckIcon, Skeleton } from '@barbervp/ui';
import { AuthSplitLayout } from '../../../components/auth/auth-split-layout';
import { BrandMark } from '../../../components/auth/brand-mark';
import { LoginForm } from '../../../components/auth/login-form';

export const metadata: Metadata = {
  title: 'Entrar no painel',
  description:
    'Acesse o painel da sua barbearia no BarberVP: agenda, financeiro e equipe em um só lugar.',
  alternates: { canonical: '/entrar' },
};

/** Provas do painel exibidas sobre a arte — os chips do protótipo. */
const HIGHLIGHTS = [
  { title: '14 agendamentos hoje', detail: 'agenda 82% ocupada' },
  { title: 'R$ 3.240 hoje', detail: '+18% vs. ontem' },
] as const;

export default function LoginPage() {
  return (
    <AuthSplitLayout
      asideWidth="50"
      aside={
        <>
          {/* Fundo: o gradiente radial + trama diagonal do protótipo. */}
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 animate-bvp-fade-bg bg-[radial-gradient(120%_120%_at_18%_0%,#2A303A,#12151A_52%,#0B0D11_100%)]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(122deg,rgba(255,255,255,.02)_0_1px,transparent_1px_13px)]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-b from-bg/30 via-bg/50 to-bg/90"
          />

          <BrandMark />

          <div className="hidden flex-col gap-2.5 lg:flex" aria-hidden="true">
            {HIGHLIGHTS.map((item, index) => (
              <div
                key={item.title}
                className="flex w-60 items-center gap-2.5 rounded-xl border border-border-strong bg-surface/70 px-3.5 py-2.5 backdrop-blur"
                style={{ marginLeft: index * 30 }}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-success bg-success/15 text-success">
                  <CheckIcon size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-fg">{item.title}</span>
                  <span className="block text-[11px] font-medium text-fg-subtle">{item.detail}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="animate-bvp-rise">
            <p className="mb-3 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-fg-subtle">
              PAINEL ADMINISTRATIVO
            </p>
            <h1 className="max-w-lg text-balance font-display text-[clamp(1.5rem,3.4vw,2.75rem)] font-bold leading-[1.06] tracking-tight text-fg">
              Menos esforço na rotina, mais <span className="text-gold">controle</span> do seu
              negócio
            </h1>
            <p className="mt-3.5 hidden max-w-md text-base leading-relaxed text-fg-muted lg:block">
              Agenda, financeiro e equipe num só painel — feito para donos e barbeiros.
            </p>
          </div>
        </>
      }
    >
      <div className="animate-bvp-up">
        <p className="mb-3.5 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-fg-subtle">
          PAINEL ADMINISTRATIVO
        </p>
        <h2 className="mb-2 font-display text-[28px] font-bold tracking-tight text-fg">
          Acesse seu painel
        </h2>
        <p className="mb-7 text-[15px] text-fg-muted">
          Gerencie agenda, financeiro e equipe da sua barbearia.
        </p>

        {/* `useSearchParams` exige Suspense no App Router. */}
        <Suspense fallback={<Skeleton className="h-80 w-full" />}>
          <LoginForm />
        </Suspense>
      </div>

      <p className="mt-10 text-center text-[11.5px] font-medium text-fg-subtle">© 2026 BarberVP</p>
    </AuthSplitLayout>
  );
}
