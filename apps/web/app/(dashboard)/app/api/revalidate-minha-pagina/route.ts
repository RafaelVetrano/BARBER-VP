import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * Derruba o cache ISR da página pública depois de um salvamento em
 * "Minha Página".
 *
 * `fetchBarbershop` marca a resposta com a tag `barbershop:{slug}` e um
 * `revalidate` de 60s. Sem esta rota, a tag existia e ninguém a invalidava:
 * trocar o logo ou desligar uma seção só aparecia em `/{slug}` até um minuto
 * depois — e o critério da aba é que salvar reflita na página pública.
 *
 * QUEM pode invalidar: o próprio dono. A rota não confia no `slug` que o
 * cliente mandaria; ela repassa o `Authorization` recebido para
 * `GET /my-page` e revalida o slug que a API devolver. Assim ninguém
 * consegue forçar revalidação da barbearia alheia — o gate é o mesmo
 * `@Roles('OWNER','MANAGER')` do resto da aba.
 *
 * Fica sob `/app` porque, com roteamento por host em produção, o middleware
 * prefixa tudo que chega no host do painel: `/app/api/...` já vem pronto e
 * atravessa sem reescrita, e em dev o caminho existe literalmente.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return NextResponse.json({ code: 'UNAUTHENTICATED', message: 'Sessão ausente.' }, { status: 401 });
  }

  const base = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '').replace(
    /\/+$/,
    '',
  );
  if (!base) {
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'API não configurada.' },
      { status: 500 },
    );
  }

  const response = await fetch(`${base}/my-page`, {
    headers: { authorization, accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json(
      { code: 'FORBIDDEN', message: 'Sem permissão para revalidar esta página.' },
      { status: response.status },
    );
  }

  const { slug } = (await response.json()) as { slug: string };
  revalidateTag(`barbershop:${slug}`);

  return NextResponse.json({ revalidated: true, slug });
}
