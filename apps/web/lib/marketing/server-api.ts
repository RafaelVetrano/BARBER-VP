import type { PublicSaasPlan } from '@barbervp/types';

/**
 * Leitura da API no SERVIDOR (React Server Components).
 *
 * Mesmo motivo do `lib/booking/server-api.ts`: a landing é indexada e
 * precisa sair do servidor com preço no HTML, não com um esqueleto que só vira
 * conteúdo depois do JavaScript. `fetch` puro — o cliente axios de
 * `packages/ui` é de navegador (interceptor de refresh, cookie de sessão,
 * singleton por aba) e nada disso existe num render compartilhado entre
 * visitantes anônimos.
 */
function baseUrl(): string {
  // Dentro do compose, `localhost` é o próprio container do Next.
  const url = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_API_URL não definida — copie o `.env.example` do app.');
  }
  return url.replace(/\/+$/, '');
}

/**
 * Planos exibidos na seção de preços.
 *
 * Devolve `[]` quando a API está fora do ar em vez de estourar: preço é a única
 * parte dinâmica de uma página que é 90% conteúdo estático, e derrubar a landing
 * inteira — com hero, features, depoimentos e FAQ — porque a API piscou seria
 * trocar uma seção degradada por zero visitantes convertidos. A seção de planos
 * mostra o próprio aviso e manda para o cadastro.
 *
 * O `revalidate` casa com o da página (ISR de 1h): mudar o preço no super admin
 * aparece aqui na revalidação seguinte, sem deploy.
 */
export async function fetchSaasPlans(): Promise<PublicSaasPlan[]> {
  try {
    const response = await fetch(`${baseUrl()}/public/saas-plans`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 3_600, tags: ['saas-plans'] },
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as PublicSaasPlan[];
  } catch {
    return [];
  }
}
