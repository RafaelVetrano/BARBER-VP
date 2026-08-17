import type { Metadata } from 'next';
import { ShellDemo } from './shell-demo';

export const metadata: Metadata = {
  title: 'Playground · AppShell',
  robots: { index: false, follow: false, nocache: true },
};

/** O `AppShell` ocupa a viewport inteira, por isso tem rota só dele. */
export default function PlaygroundShellPage() {
  return <ShellDemo />;
}
