import Link from 'next/link';
import { buttonClasses } from '@barbervp/ui';

/**
 * Slug inexistente.
 *
 * Não sugere nomes parecidos de propósito: a lista de barbearias cadastradas
 * não é pública, e um "você quis dizer…" a transformaria em algo enumerável.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-bold text-fg">Barbearia não encontrada</h1>
      <p className="text-sm leading-relaxed text-fg-muted">
        Esse link não corresponde a nenhuma barbearia. Confira o endereço com quem te enviou — ele
        costuma terminar com o nome da barbearia.
      </p>
      <Link href="https://barbervp.com.br" className={buttonClasses({ variant: 'outline' })}>
        Conhecer o BarberVP
      </Link>
    </main>
  );
}
