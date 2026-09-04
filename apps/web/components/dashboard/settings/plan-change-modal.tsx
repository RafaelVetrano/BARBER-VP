'use client';

import { Button, CheckIcon, Modal, Skeleton } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import { usePlanChangePreviewQuery } from '@/lib/dashboard/api/settings';

export interface PlanChangeModalProps {
  /** `null` = fechado. */
  planId: string | null;
  onClose: () => void;
  onConfirm: (planId: string) => void;
  confirming: boolean;
}

/**
 * `modalTrocarPlano` (`Dashboard.dc.html` l.3483): o título com o preço novo,
 * o bloco verde "Você vai ganhar", o bloco vermelho "Você vai perder" e os
 * dois botões.
 *
 * As duas listas vêm de `GET /settings/plan/preview/:planId` — o diff é
 * calculado sobre o `features` REAL dos planos, com os nomes dos barbeiros que
 * o downgrade desliga. Cada bloco só aparece se tiver conteúdo, exatamente
 * como os dois `sc-if` do protótipo.
 *
 * "Confirmar" só acende depois que o impacto chegou: aprovar uma troca cujo
 * cálculo ainda está em voo seria assinar em branco.
 */
export function PlanChangeModal({ planId, onClose, onConfirm, confirming }: PlanChangeModalProps) {
  const preview = usePlanChangePreviewQuery(planId);
  const data = preview.data;

  return (
    <Modal
      open={planId !== null}
      onClose={onClose}
      title={
        data
          ? `Mudar para o plano ${data.planName} — ${formatBRL(data.priceCents)}/mês?`
          : 'Mudar de plano'
      }
      footer={
        <div className="flex w-full gap-2.5">
          <Button variant="outline" fullWidth onClick={onClose}>
            Cancelar
          </Button>
          <Button
            fullWidth
            loading={confirming}
            disabled={!data}
            onClick={() => data && onConfirm(data.planId)}
          >
            Confirmar
          </Button>
        </div>
      }
    >
      {preview.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}

      {preview.isError && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger">
            Não foi possível calcular o impacto da troca.
          </p>
          <Button size="sm" variant="outline" onClick={() => void preview.refetch()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-4">
          {data.gained.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-success">
                Você vai ganhar
              </span>
              {data.gained.map((item) => (
                <p key={item} className="flex items-start gap-2 text-[13px] text-fg">
                  <CheckIcon size={15} className="mt-0.5 shrink-0 text-success" />
                  {item}
                </p>
              ))}
            </div>
          )}

          {data.lost.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-danger">
                Você vai perder
              </span>
              {data.lost.map((item) => (
                <p key={item} className="flex items-start gap-2 text-[13px] text-fg">
                  <span aria-hidden="true" className="mt-px shrink-0 text-danger">
                    ✕
                  </span>
                  {item}
                </p>
              ))}
            </div>
          )}

          {data.gained.length === 0 && data.lost.length === 0 && (
            <p className="text-[13px] text-fg-muted">
              Os dois planos liberam os mesmos recursos — só o valor da mensalidade muda.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
