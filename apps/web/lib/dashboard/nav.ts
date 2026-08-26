import type { ReactNode } from 'react';
import type { Role } from '@barbervp/types';

export interface NavDef {
  key: string;
  label: string;
  href: string;
  /** `true` = rota real desta fase; `false` = placeholder "em construção" (fase 07/08). */
  ready: boolean;
  /** Papéis que veem o item. Omitido = todo mundo (OWNER/MANAGER/BARBER). */
  roles?: Role[];
}

/**
 * Os 14 itens de `NAV_DEFS` do bundle (`Dashboard.dc.html`), portados como
 * ícones em `packages/ui` desde a fase 02 — as 13 rotas das fases 06+07 já
 * ficam clicáveis; só falta o Super Admin (fase 08, fora deste app).
 *
 * `roles` implementa a visão restrita do `DashboardFuncionario`: mesmo shell,
 * mesmas rotas, só o nav muda (`SPEC.md` → "nav restrito, sem Financeiro/
 * Equipe/Configurações").
 */
export const NAV_DEFS: NavDef[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/app', ready: true },
  { key: 'agenda', label: 'Agenda', href: '/app/agenda', ready: true },
  { key: 'clientes', label: 'Clientes', href: '/app/clientes', ready: true, roles: ['OWNER', 'MANAGER'] },
  { key: 'comandas', label: 'Comandas', href: '/app/comandas', ready: true },
  {
    key: 'financeiro',
    label: 'Financeiro',
    href: '/app/financeiro',
    ready: true,
    roles: ['OWNER', 'MANAGER'],
  },
  {
    key: 'comissoes',
    label: 'Comissões',
    href: '/app/comissoes',
    ready: true,
  },
  // O `DashboardFuncionario.dc.html` (l.1612) NÃO tem Fidelidade no nav: a aba
  // administra os planos que a casa vende, não a produção do barbeiro. O
  // backend já recusa (`@Roles('OWNER','MANAGER')`) — aqui o link some para
  // não oferecer um 403.
  {
    key: 'fidelidade',
    label: 'Fidelidade',
    href: '/app/fidelidade',
    ready: true,
    roles: ['OWNER', 'MANAGER'],
  },
  { key: 'whatsapp', label: 'WhatsApp', href: '/app/whatsapp', ready: true, roles: ['OWNER', 'MANAGER'] },
  {
    key: 'assistente-ia',
    label: 'Assistente IA',
    href: '/app/assistente-ia',
    ready: true,
    roles: ['OWNER', 'MANAGER'],
  },
  // `BARBER` vê Relatórios: o `DashboardFuncionario.dc.html` tem o item no nav
  // (l.1617) e uma aba própria (l.667–775) com a produção dele. O recorte é do
  // servidor (`StaffScope`), não do menu.
  { key: 'relatorios', label: 'Relatórios', href: '/app/relatorios', ready: true },
  {
    key: 'servicos-produtos',
    label: 'Serviços & Produtos',
    href: '/app/servicos-produtos',
    ready: true,
    roles: ['OWNER', 'MANAGER'],
  },
  { key: 'equipe', label: 'Equipe', href: '/app/equipe', ready: true, roles: ['OWNER', 'MANAGER'] },
  {
    key: 'minha-pagina',
    label: 'Minha Página',
    href: '/app/minha-pagina',
    ready: true,
    roles: ['OWNER', 'MANAGER'],
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    href: '/app/configuracoes',
    ready: true,
    roles: ['OWNER', 'MANAGER'],
  },
];

export function navForRole(role: Role | undefined): NavDef[] {
  return NAV_DEFS.filter((item) => !item.roles || (role && item.roles.includes(role)));
}

/** `iconOf` mora no componente que já importa `@barbervp/ui` — ver `dashboard-chrome.tsx`. */
export type NavIconMap = Record<string, ReactNode>;
