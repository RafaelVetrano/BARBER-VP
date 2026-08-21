import type { PublicBarbershop } from '@barbervp/types';

/**
 * Leitura da API no SERVIDOR (React Server Components).
 *
 * A página `/{slug}` é indexada: o robô de busca e o cliente com 4G ruim
 * precisam receber HTML pronto, não um esqueleto que só vira conteúdo depois de
 * o JavaScript baixar. Por isso a primeira carga passa por aqui, com `fetch`
 * puro — o cliente axios de `packages/ui` é de navegador: carrega interceptor de
 * refresh, cookie de sessão e um singleton por aba, nada disso faz sentido num
 * render de servidor compartilhado entre visitantes.
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
 * Página pública da barbearia. Devolve `null` em 404 para a rota chamar
 * `notFound()` e renderizar a tela de slug inexistente.
 *
 * Sempre ANÔNIMA: nenhum cookie de sessão atravessa, então a resposta pode ser
 * cacheada e servida a qualquer visitante. O que depende de quem está logado
 * (assinatura ativa, "Meus agendamentos") é buscado no cliente, depois da
 * hidratação.
 */
export async function fetchBarbershop(slug: string): Promise<PublicBarbershop | null> {
  const response = await fetch(`${baseUrl()}/public/${encodeURIComponent(slug)}`, {
    headers: { accept: 'application/json' },
    // A barbearia muda de vez em quando (preço, equipe); um minuto de cache
    // absorve a enxurrada de acessos de quando o link é postado no story.
    next: { revalidate: 60, tags: [`barbershop:${slug}`] },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Falha ao carregar a barbearia ${slug}: HTTP ${response.status}`);
  }

  return (await response.json()) as PublicBarbershop;
}
