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
 * ícones em `packages/ui` desde a fase 02 — só as 5 rotas desta fase (fase
 * 06) ficam clicáveis; o resto é placeholder até a fase 07/08.
 *
 * `roles` implementa a visão restrita do `DashboardFuncionario`: mesmo shell,
 * mesmas rotas, só o nav muda (`SPEC.md` → "nav restrito, sem Financeiro/
 * Equipe/Configurações").
 */
export const NAV_DEFS: NavDef[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/', ready: true },
  { key: 'agenda', label: 'Agenda', href: '/agenda', ready: true },
  { key: 'clientes', label: 'Clientes', href: '/clientes', ready: true, roles: ['OWNER', 'MANAGER'] },
  { key: 'comandas', label: 'Comandas', href: '/comandas', ready: true },
  {
    key: 'financeiro',
    label: 'Financeiro',
    href: '/financeiro',
    ready: true,
    roles: ['OWNER', 'MANAGER'],
  },
  {
    key: 'comissoes',
    label: 'Comissões',
    href: '/comissoes',
    ready: true,
  },
  { key: 'fidelidade', label: 'Fidelidade', href: '/fidelidade', ready: false },
  { key: 'whatsapp', label: 'WhatsApp', href: '/whatsapp', ready: false, roles: ['OWNER', 'MANAGER'] },
  {
    key: 'assistente-ia',
    label: 'Assistente IA',
    href: '/assistente-ia',
    ready: false,
    roles: ['OWNER', 'MANAGER'],
  },
  {
    key: 'relatorios',
    label: 'Relatórios',
    href: '/relatorios',
    ready: false,
    roles: ['OWNER', 'MANAGER'],
  },
  {
    key: 'servicos-produtos',
    label: 'Serviços & Produtos',
    href: '/servicos-produtos',
    ready: true,
    roles: ['OWNER', 'MANAGER'],
  },
  { key: 'equipe', label: 'Equipe', href: '/equipe', ready: true, roles: ['OWNER', 'MANAGER'] },
  {
    key: 'minha-pagina',
    label: 'Minha Página',
    href: '/minha-pagina',
    ready: false,
    roles: ['OWNER', 'MANAGER'],
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    href: '/configuracoes',
    ready: false,
    roles: ['OWNER', 'MANAGER'],
  },
];

export function navForRole(role: Role | undefined): NavDef[] {
  return NAV_DEFS.filter((item) => !item.roles || (role && item.roles.includes(role)));
}

/** `iconOf` mora no componente que já importa `@barbervp/ui` — ver `dashboard-chrome.tsx`. */
export type NavIconMap = Record<string, ReactNode>;
