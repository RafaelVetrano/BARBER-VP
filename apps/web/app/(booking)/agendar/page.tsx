import type { Metadata } from 'next';
import { ApiStatus } from '@barbervp/ui';
import { ClientSessionBar } from '@/components/booking/client-session-bar';

/**
 * Raiz do booking.
 *
 * Não existe "página do booking" sem barbearia: a superfície inteira vive em
 * `/{slug}`. Esta rota é a que alguém alcança digitando o domínio do booking à
 * mão — o middleware manda `agendar.barbervp.com/` para cá — e o que ela pode
 * fazer de útil é explicar isso, não listar as barbearias cadastradas, que não é
 * informação pública.
 *
 * Vive em `/agendar` (e não em `/`) porque `/` agora é a landing de vendas: no
 * frontend único as duas superfícies dividem a mesma árvore de rotas.
 */
export const metadata: Metadata = {
  title: 'Agendamento online',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="font-display text-2xl font-bold text-fg">Agendamento BarberVP</h1>
      <p className="text-sm leading-relaxed text-fg-muted">
        Cada barbearia tem o próprio link, terminado com o nome dela. Abra o link que a barbearia
        te enviou para ver os serviços e escolher um horário.
      </p>

      <ClientSessionBar />
      <ApiStatus />
    </main>
  );
}
