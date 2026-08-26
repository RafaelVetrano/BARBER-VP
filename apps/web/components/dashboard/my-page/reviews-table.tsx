'use client';

import type { MyPageReviewItem } from '@barbervp/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ResponsiveTable,
  Skeleton,
  StarIcon,
  Switch,
  type TableColumn,
} from '@barbervp/ui';
import {
  useMyPageReviewsQuery,
  useSetReviewPublishedMutation,
} from '@/lib/dashboard/api/my-page';

const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * "Avaliações recebidas" (`Dashboard.dc.html` l.2429).
 *
 * O toggle da última coluna é o `published` da `Review`: desligá-lo tira a
 * avaliação da página pública E da média da nota, na mesma requisição — é a
 * única curadoria que o dono tem sobre o que aparece em `/{slug}`.
 */
export function ReviewsTable() {
  const query = useMyPageReviewsQuery();
  const setPublished = useSetReviewPublishedMutation();
  const pendingId = setPublished.isPending ? setPublished.variables?.id : undefined;

  const columns: TableColumn<MyPageReviewItem>[] = [
    {
      key: 'data',
      header: 'Data',
      mobile: 'meta',
      render: (review) => (
        <span className="whitespace-nowrap text-fg-muted">
          {DATE.format(new Date(review.createdAt))}
        </span>
      ),
    },
    {
      key: 'cliente',
      header: 'Cliente',
      mobile: 'title',
      render: (review) => <span className="whitespace-nowrap">{review.authorName}</span>,
    },
    {
      key: 'nota',
      header: 'Nota',
      mobile: 'meta',
      render: (review) => (
        <span
          className="flex items-center gap-0.5 whitespace-nowrap text-gold"
          aria-label={`${review.rating} de 5 estrelas`}
        >
          {/* Preenchida: a coluna "Nota" do protótipo (l.2455) desenha ★
              sólido, não contorno. */}
          {Array.from({ length: review.rating }, (_, index) => (
            <StarIcon key={index} size={13} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          ))}
        </span>
      ),
    },
    {
      key: 'comentario',
      header: 'Comentário',
      mobile: 'subtitle',
      render: (review) =>
        review.comment ? (
          <span className="text-fg">{review.comment}</span>
        ) : (
          <span className="text-fg-subtle">Sem comentário</span>
        ),
    },
    {
      key: 'exibir',
      header: 'Exibir no site',
      align: 'right',
      mobile: 'meta',
      render: (review) => (
        // O `<label>` em volta é o alvo de toque de verdade: o interruptor tem
        // 44×24 e, no card do celular, quem recebe o dedo é o rótulo.
        <label
          htmlFor={`bvp-review-${review.id}`}
          className="flex min-h-11 min-w-11 cursor-pointer items-center justify-end md:justify-center"
        >
          <span className="sr-only">
            Exibir a avaliação de {review.authorName} no site
          </span>
          <Switch
            id={`bvp-review-${review.id}`}
            checked={review.published}
            disabled={pendingId === review.id}
            onChange={(event) =>
              setPublished.mutate({ id: review.id, published: event.target.checked })
            }
          />
        </label>
      ),
    },
  ];

  return (
    <Card flush>
      <CardHeader title="Avaliações recebidas" className="border-b border-border p-4" />

      <div className="p-4">
        {query.isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        )}

        {query.isError && (
          <EmptyState
            message="Não foi possível carregar as avaliações"
            description="A lista não respondeu. Tente de novo."
            action={
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                Tentar de novo
              </Button>
            }
          />
        )}

        {query.data && (
          <ResponsiveTable
            columns={columns}
            rows={query.data}
            getRowKey={(review) => review.id}
            caption="Avaliações recebidas pela barbearia"
            empty={
              <EmptyState
                message="Nenhuma avaliação ainda"
                description="As notas que os clientes deixarem depois do atendimento aparecem aqui, e você escolhe quais vão para a página pública."
              />
            }
          />
        )}
      </div>
    </Card>
  );
}
