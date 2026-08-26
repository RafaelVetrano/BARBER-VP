'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  MyPageImageSlot,
  MyPageReviewItem,
  MyPageSettings,
  PublicBarbershop,
  UpdateMyPageDto,
} from '@barbervp/types';

/**
 * Chaves SEM prefixo comum de propósito: `['my-page', ...]` faria
 * `invalidateQueries(['my-page'])` casar por prefixo e refazer também o GET
 * que a própria mutação acabou de gravar no cache.
 */
const PAGE_KEY = ['my-page'] as const;
const PREVIEW_KEY = ['my-page-preview'] as const;
const REVIEWS_KEY = ['my-page-reviews'] as const;

/**
 * O cliente axios do projeto nasce com `Content-Type: application/json` fixo
 * (`createApiClient`), e o `transformRequest` do axios 1.x converte FormData
 * em JSON quando esse header está presente — o arquivo chegaria ao servidor
 * como `{}`. Declarar `multipart/form-data` aqui desarma essa conversão; o
 * adapter do browser troca o header pelo mesmo tipo COM o `boundary` gerado.
 */
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } } as const;

export function useMyPageQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: PAGE_KEY,
    queryFn: async () => {
      const { data } = await client.get<MyPageSettings>('/my-page');
      return data;
    },
  });
}

/**
 * Payload da página pública, servido pelo MESMO serviço de `/{slug}` — é o que
 * dá ao "Preview ao vivo" o direito de se chamar preview.
 */
export function useMyPagePreviewQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: PREVIEW_KEY,
    queryFn: async () => {
      const { data } = await client.get<PublicBarbershop>('/my-page/preview');
      return data;
    },
  });
}

export function useMyPageReviewsQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: REVIEWS_KEY,
    queryFn: async () => {
      const { data } = await client.get<MyPageReviewItem[]>('/my-page/reviews');
      return data;
    },
  });
}

/**
 * Toda escrita da aba invalida o preview junto: o painel da esquerda e o
 * telefone da direita mostram o MESMO estado, e deixar um dos dois para trás
 * seria mentir sobre como a página ficou.
 *
 * E derruba o cache ISR de `/{slug}` no mesmo gesto — sem isso a página
 * pública levaria até 60s para mostrar o que o dono acabou de salvar.
 * `baseURL: ''` desvia do backend NestJS: este endereço é do próprio Next.
 * A falha é silenciosa de propósito: o dado JÁ foi salvo, e o cache expira
 * sozinho — avisar de erro aqui assustaria por um atraso de um minuto.
 */
function useMyPageInvalidation() {
  const queryClient = useQueryClient();
  const { client } = useEstablishmentAuth();
  return () => {
    void queryClient.invalidateQueries({ queryKey: PREVIEW_KEY });
    void client.post('/app/api/revalidate-minha-pagina', null, { baseURL: '' }).catch(() => {});
  };
}

export function useUpdateMyPageMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useMyPageInvalidation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateMyPageDto) => {
      const { data } = await client.patch<MyPageSettings>('/my-page', dto);
      return data;
    },
    onSuccess: (data) => {
      // O GET volta na resposta do PATCH: escrever direto no cache evita o
      // piscar entre "salvo" e "recarregado".
      queryClient.setQueryData(PAGE_KEY, data);
      invalidate();
    },
  });
}

export function useUploadMyPageImageMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useMyPageInvalidation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slot, file }: { slot: MyPageImageSlot; file: File }) => {
      const body = new FormData();
      body.append('file', file);
      const { data } = await client.post<MyPageSettings>(
        `/my-page/images/${slot}`,
        body,
        MULTIPART,
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PAGE_KEY, data);
      invalidate();
    },
  });
}

export function useRemoveMyPageImageMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useMyPageInvalidation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slot: MyPageImageSlot) => {
      const { data } = await client.delete<MyPageSettings>(`/my-page/images/${slot}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PAGE_KEY, data);
      invalidate();
    },
  });
}

export function useAddPhotoMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useMyPageInvalidation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('file', file);
      const { data } = await client.post<MyPageSettings>('/my-page/photos', body, MULTIPART);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PAGE_KEY, data);
      invalidate();
    },
  });
}

export function useRemovePhotoMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useMyPageInvalidation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.delete<MyPageSettings>(`/my-page/photos/${id}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PAGE_KEY, data);
      invalidate();
    },
  });
}

export function useSetReviewPublishedMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  const invalidate = useMyPageInvalidation();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { data } = await client.patch<MyPageReviewItem[]>(`/my-page/reviews/${id}`, {
        published,
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(REVIEWS_KEY, data);
      // Despublicar muda a nota e a lista da página pública — preview e
      // `/{slug}` têm de refletir isso na mesma interação.
      invalidate();
    },
  });
}
