import { Skeleton, SkeletonGroup } from '@barbervp/ui';

/**
 * Esqueleto da página pública.
 *
 * Reproduz a silhueta real (capa alta, logo redonda, título, lista de cards)
 * para o conteúdo não "pular" quando chegar — em 4G ruim essa é a tela que o
 * cliente vê por mais tempo.
 */
export default function Loading() {
  return (
    <SkeletonGroup
      label="Carregando a barbearia"
      className="mx-auto w-full max-w-[560px] pb-10"
    >
      <Skeleton className="h-52 w-full rounded-none sm:h-64 md:h-72" />

      <div className="px-5">
        <Skeleton className="-mt-11 size-[72px] rounded-full border-[3px] border-bg" />
        <Skeleton variant="text" className="mt-4 h-7 w-52" />
        <Skeleton variant="text" className="mt-2 w-40" />
        <Skeleton variant="text" className="mt-2 w-32" />

        <div className="mt-4 flex gap-3">
          <Skeleton className="size-11 rounded-full" />
          <Skeleton className="size-11 rounded-full" />
          <Skeleton className="size-11 rounded-full" />
        </div>

        <Skeleton className="mt-5 h-[52px] w-full rounded-xl" />

        <Skeleton variant="text" className="mt-8 h-6 w-44" />
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-[72px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}
