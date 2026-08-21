import type { Metadata } from 'next';
import { ToastProvider } from '@barbervp/ui';
import { Gallery } from './gallery';
import { PlaygroundShell } from './playground-shell';

export const metadata: Metadata = {
  title: 'Playground do design system',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Página de inspeção visual da fase 02.
 *
 * `?frame=1` devolve só a galeria (sem a barra de viewport) — é o que a
 * `PlaygroundShell` carrega dentro do `<iframe>` de 360/768/1440px.
 */
export default function PlaygroundPage({
  searchParams,
}: {
  searchParams: { frame?: string };
}) {
  if (searchParams.frame === '1') {
    return (
      <ToastProvider>
        <Gallery />
      </ToastProvider>
    );
  }

  return <PlaygroundShell />;
}
