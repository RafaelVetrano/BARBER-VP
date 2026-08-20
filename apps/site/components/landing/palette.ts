import type { CSSProperties } from 'react';

/**
 * Paleta "Light SaaS" — a única das quatro do protótipo que existe em produção.
 *
 * O `.dc.html` expunha um seletor de paleta como prop de editor, com o escolhido
 * gravado em `localStorage('bvp-palette')`. Isso é ferramenta de exploração de
 * design, não feature do produto: aqui os valores entram fixos, sem seletor e
 * sem storage.
 *
 * A landing é clara de propósito, contra o resto do produto (que é escuro e
 * segue os tokens de `@barbervp/config`). Não é bug nem esquecimento: quem lê
 * esta página é um dono de barbearia decidindo se compra, num contexto de site
 * de vendas; quem usa o painel escuro já é cliente e passa horas na tela. Por
 * isso a landing NÃO usa os componentes de `packages/ui` — eles carregam os
 * tokens escuros e ficariam ilegíveis sobre `#FAFAFA`.
 */
export const LIGHT_SAAS = {
  bg: '#FAFAFA',
  bg2: '#F1F1F1',
  surface: '#FFFFFF',
  surface2: '#F4F4F4',
  line: '#E7E7E7',
  line2: '#D8D8D8',
  txt: '#1A1A1A',
  txt2: '#5A5A5A',
  txt3: '#8C8C8C',
  gold: '#E8A33D',
  gold2: '#F2B65C',
  green: '#2F9E6B',
  header: 'rgba(255,255,255,.82)',
  accentSoft: 'rgba(232,163,61,.12)',
  /** Gradiente do topo do hero (`hero1`/`hero2` do protótipo). */
  hero1: '#FFFFFF',
  hero2: '#FAFAFA',
} as const;

/**
 * Texto sobre dourado. O protótipo usa `#1a1408` em todo botão dourado — é
 * quase preto, e dá contraste AA sobre `#E8A33D` (branco não daria).
 */
export const ON_GOLD = '#1a1408';

/** Vars consumidas por `bg-[var(--bvp-*)]` nas seções. */
export const paletteVars: CSSProperties = {
  '--bvp-bg': LIGHT_SAAS.bg,
  '--bvp-bg2': LIGHT_SAAS.bg2,
  '--bvp-surface': LIGHT_SAAS.surface,
  '--bvp-surface-2': LIGHT_SAAS.surface2,
  '--bvp-line': LIGHT_SAAS.line,
  '--bvp-line-2': LIGHT_SAAS.line2,
  '--bvp-txt': LIGHT_SAAS.txt,
  '--bvp-txt-2': LIGHT_SAAS.txt2,
  '--bvp-txt-3': LIGHT_SAAS.txt3,
  '--bvp-gold': LIGHT_SAAS.gold,
  '--bvp-gold-2': LIGHT_SAAS.gold2,
  '--bvp-green': LIGHT_SAAS.green,
  '--bvp-header': LIGHT_SAAS.header,
  '--bvp-accent-soft': LIGHT_SAAS.accentSoft,
  '--bvp-on-gold': ON_GOLD,
} as CSSProperties;

/**
 * Deslocamento do scroll suave das âncoras: a nav é sticky com 66px de altura,
 * e sem isso o título da seção para embaixo dela.
 */
export const SCROLL_OFFSET_PX = 80;
