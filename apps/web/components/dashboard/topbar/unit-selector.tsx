'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDownIcon,
  LockIcon,
  Popover,
  PopoverDivider,
  PopoverItem,
  cn,
} from '@barbervp/ui';
import type { DashboardShellResponse } from '@barbervp/types';
import { UpgradeModal } from '../upgrade-modal';

export interface UnitSelectorProps {
  shell: DashboardShellResponse | undefined;
}

/**
 * Seletor de unidade da topbar (`Dashboard.dc.html`, linhas 88–110).
 *
 * Sem `multiUnidades` no plano, a API devolve `units: []` e o seletor mostra só
 * o nome da barbearia — o "+ Nova unidade" continua visível, com cadeado, e
 * abre o upsell em vez de navegar. É o mesmo `multiUnidadesLocked` do
 * protótipo, com a diferença de que quem decide é o servidor.
 */
export function UnitSelector({ shell }: UnitSelectorProps) {
  const router = useRouter();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const locked = !shell?.features.multiUnidades;
  const units = shell?.units ?? [];
  const current =
    units.find((unit) => unit.id === selectedId) ?? units.find((unit) => unit.isDefault) ?? units[0];
  const currentLabel = current?.name ?? shell?.tenant.name ?? 'Barbearia';

  return (
    <>
      <Popover
        label="Trocar de unidade"
        width={240}
        align="start"
        className="min-w-[72px] shrink"
        triggerClassName={cn(
          'flex h-11 w-full items-center gap-2 rounded-control border border-border bg-surface-2 px-3',
          'sm:h-10 sm:px-3.5',
        )}
        trigger={
          <>
            <span className="min-w-0 truncate text-sm font-medium text-fg">{currentLabel}</span>
            <ChevronDownIcon size={14} className="shrink-0 text-fg-muted" />
          </>
        }
        title="Unidade"
      >
        {(close) => (
          <>
            {units.length === 0 ? (
              <PopoverItem selected onSelect={close}>
                {shell?.tenant.name ?? 'Barbearia'}
              </PopoverItem>
            ) : (
              units.map((unit) => (
                <PopoverItem
                  key={unit.id}
                  selected={unit.id === current?.id}
                  onSelect={() => {
                    setSelectedId(unit.id);
                    close();
                  }}
                >
                  {unit.name}
                </PopoverItem>
              ))
            )}

            <PopoverDivider />

            <PopoverItem
              className="text-gold hover:bg-gold/10"
              trailing={locked ? <LockIcon size={12} className="text-fg-muted" /> : undefined}
              onSelect={() => {
                close();
                if (locked) {
                  setUpgradeOpen(true);
                } else {
                  router.push('/app/configuracoes?tab=unidades');
                }
              }}
            >
              + Nova unidade
            </PopoverItem>
          </>
        )}
      </Popover>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        minPlanLabel="Avançado"
        description="Múltiplas unidades fazem parte do plano Avançado."
        benefits={[
          'Cadastre unidades ilimitadas',
          'Relatórios consolidados entre unidades',
          'Equipe e agenda por unidade',
        ]}
      />
    </>
  );
}
