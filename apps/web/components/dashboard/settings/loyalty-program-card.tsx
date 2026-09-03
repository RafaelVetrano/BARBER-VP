'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, Input, Select, Skeleton, Switch, useToast } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import { BlockError } from '@/components/dashboard/blocks';
import { FeatureLocked } from '@/components/dashboard/feature-locked';
import { isFeatureGateError } from '@/lib/dashboard/feature-error';
import {
  useLoyaltyProgramQuery,
  useUpdateLoyaltyProgramMutation,
} from '@/lib/dashboard/api/loyalty';
import { inputToCents } from '@/components/dashboard/finance/finance-shared';

/**
 * Programa de pontos — o interruptor que faltava.
 *
 * `GET|PATCH /loyalty/program` ficou órfão de tela quando a sub-aba "Pontos"
 * saiu do protótipo revisado junto com Sorteios (agente 21). O RECURSO nunca
 * saiu: a comanda resgata pontos, o drawer do cliente mostra o saldo e a lista
 * de clientes tem coluna "Pontos". Resultado: um recurso vivo em três telas
 * que **ninguém no produto podia ligar, desligar ou calibrar**.
 *
 * Mora em Preferências, e não em Barbearia, porque é uma REGRA DE OPERAÇÃO da
 * casa — vizinha do bloqueio por faltas, da antecedência mínima e do prazo de
 * cancelamento. A aba Barbearia guarda dado cadastral (nome, endereço, fuso,
 * horário de funcionamento).
 *
 * O gate é o mesmo da rota: `fidelidadePontos` (Profissional+) e
 * `@Roles('OWNER','MANAGER')`. Quem está no Essencial vê o upsell com os
 * benefícios visíveis, nunca um campo morto.
 */

const EXPIRACAO_OPTIONS = [
  { value: '', label: 'Não expiram' },
  { value: '6', label: '6 meses' },
  { value: '12', label: '12 meses' },
  { value: '24', label: '24 meses' },
];

const LOCKED_BULLETS = [
  'O cliente acumula pontos a cada real gasto, sem cartão de papel.',
  'O resgate vira desconto direto no fechamento da comanda.',
  'O saldo aparece na ficha do cliente e na lista, para o balcão lembrar.',
];

export function LoyaltyProgramCard() {
  const { toast } = useToast();
  const programQuery = useLoyaltyProgramQuery();
  const update = useUpdateLoyaltyProgramMutation();

  const program = programQuery.data;

  // Os três campos numéricos são digitados, então vivem como rascunho local e
  // só sobem no `blur` — salvar a cada tecla mandaria "1", "12", "120" para o
  // servidor enquanto o dono ainda digita "1200".
  const [gasto, setGasto] = useState('');
  const [pontos, setPontos] = useState('');
  const [desconto, setDesconto] = useState('');

  useEffect(() => {
    if (!program) return;
    setGasto(String(program.gastoPorPonto));
    setPontos(String(program.pontosParaDesconto));
    setDesconto((program.valorDesconto / 100).toFixed(2).replace('.', ','));
  }, [program]);

  if (programQuery.isLoading) return <Skeleton className="h-[360px] max-w-[640px] rounded-xl" />;

  // O 403 do gate é resposta legítima do servidor, não falha — quem decide o
  // plano é a API, a tela só explica o motivo (regra 3).
  if (isFeatureGateError(programQuery.error)) {
    return (
      <FeatureLocked
        title="Disponível no plano Profissional"
        description="Ligue o programa de pontos e transforme o gasto do cliente em desconto na próxima visita."
        benefits={LOCKED_BULLETS}
        minPlanLabel="Profissional"
      />
    );
  }

  if (programQuery.isError) {
    return <BlockError label="o programa de pontos" onRetry={() => void programQuery.refetch()} />;
  }
  if (!program) return null;

  const save = (patch: Parameters<typeof update.mutate>[0]) => {
    update.mutate(patch, {
      onError: (error) =>
        toast({
          message: error instanceof Error ? error.message : 'Não foi possível salvar.',
          tone: 'danger',
        }),
    });
  };

  /** Só sobe o que MUDOU, e nunca um valor inválido. */
  const saveNumber = (field: 'gastoPorPonto' | 'pontosParaDesconto', raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || value === program[field]) return;
    save({ [field]: Math.round(value) });
  };

  const saveDesconto = () => {
    const cents = inputToCents(desconto);
    if (cents <= 0 || cents === program.valorDesconto) return;
    save({ valorDesconto: cents });
  };

  return (
    <Card className="max-w-[640px] gap-0 p-5">
      <CardHeader
        title="Programa de pontos"
        description="O cliente acumula pontos a cada compra e troca por desconto na comanda."
        action={
          <Switch
            aria-label="Ligar o programa de pontos"
            checked={program.active}
            disabled={update.isPending}
            onChange={(event) => save({ active: event.target.checked })}
          />
        }
      />

      {/*
        Programa desligado esconde a calibragem em vez de desabilitá-la (regra
        4: dois ramos de render, nunca `disabled` para regra de negócio).
      */}
      {program.active && (
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border py-3.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">Reais para ganhar 1 ponto</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                A cada R$ {gasto || program.gastoPorPonto} gastos o cliente ganha 1 ponto.
              </p>
            </div>
            <Input
              aria-label="Reais para ganhar 1 ponto"
              className="w-24"
              inputMode="numeric"
              value={gasto}
              onChange={(event) => setGasto(event.target.value)}
              onBlur={() => saveNumber('gastoPorPonto', gasto)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border py-3.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">Pontos para resgatar</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                Quantos pontos o cliente precisa juntar para trocar por desconto.
              </p>
            </div>
            <Input
              aria-label="Pontos necessários para resgatar"
              className="w-24"
              inputMode="numeric"
              value={pontos}
              onChange={(event) => setPontos(event.target.value)}
              onBlur={() => saveNumber('pontosParaDesconto', pontos)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border py-3.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">Desconto do resgate</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                Vale {formatBRL(program.valorDesconto)} a cada {program.pontosParaDesconto} pontos.
              </p>
            </div>
            <Input
              aria-label="Valor do desconto do resgate"
              className="w-28"
              inputMode="decimal"
              addonLeft="R$"
              value={desconto}
              onChange={(event) => setDesconto(event.target.value)}
              onBlur={saveDesconto}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border py-3.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">Validade dos pontos</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                Prazo para o cliente usar o que acumulou.
              </p>
            </div>
            <Select
              aria-label="Validade dos pontos"
              className="w-36"
              value={program.expiracaoMeses === null ? '' : String(program.expiracaoMeses)}
              onChange={(event) =>
                save({ expiracaoMeses: event.target.value ? Number(event.target.value) : null })
              }
              options={EXPIRACAO_OPTIONS}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
