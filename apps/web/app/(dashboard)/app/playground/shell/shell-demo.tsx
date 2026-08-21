'use client';

import { useState } from 'react';
import {
  AppShell,
  Avatar,
  Button,
  Card,
  CardHeader,
  IconButton,
  Input,
  SearchIcon,
  StatCard,
} from '@barbervp/ui';
import { DEMO_NAV } from '../gallery';

/**
 * Demonstração do `AppShell` no tamanho real da tela.
 *
 * Os itens de navegação são os 14 de `NAV_DEFS` do `Dashboard.dc.html`, com os
 * ícones portados — o conteúdo do miolo é amostra de vitrine, não produto.
 */
export function ShellDemo() {
  const [active, setActive] = useState('dashboard');

  return (
    <AppShell
      activeKey={active}
      nav={DEMO_NAV.map((item) => ({ ...item, onSelect: () => setActive(item.key) }))}
      topbarStart={
        <div className="hidden w-64 sm:block">
          <Input aria-label="Buscar" placeholder="Cliente, telefone…" addonLeft={<SearchIcon size={16} />} />
        </div>
      }
      topbarEnd={
        <>
          <Button size="sm">Novo agendamento</Button>
          <IconButton aria-label="Sua conta" className="p-0">
            <Avatar name="Rafael Souza" size="md" />
          </IconButton>
        </>
      }
      sidebarFooter={
        <Card tone="raised" className="gap-2.5">
          <div>
            <p className="text-[13px] font-semibold text-fg">Plano Profissional</p>
            <p className="mt-0.5 text-xs text-fg-muted">R$ 89/mês · até 4 barbeiros</p>
          </div>
          <Button size="sm" variant="outline" fullWidth>
            Gerenciar plano
          </Button>
        </Card>
      }
    >
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">
          Seção ativa: <span className="text-gold">{active}</span>
        </h1>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Faturamento hoje" value="R$ 1.240,00" delta={{ label: '12% vs ontem', direction: 'up' }} />
          <StatCard label="Agendamentos hoje" value="23" hint="18 confirmados · 3 pendentes" />
          <StatCard label="Ticket médio (mês)" value="R$ 62,40" delta={{ label: '4%', direction: 'up' }} />
          <StatCard label="Novos clientes (mês)" value="38" />
        </div>

        <Card>
          <CardHeader
            title="Como testar a responsividade"
            description="Estreite a janela abaixo de 1024px: a sidebar sai do fluxo e o botão de menu aparece na topbar."
          />
        </Card>
      </div>
    </AppShell>
  );
}
