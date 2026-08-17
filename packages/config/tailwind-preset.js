/**
 * Preset Tailwind compartilhado do BarberVP.
 *
 * Tokens do **tema de produto** (decisão em `agentes/SPEC.md` → Design system):
 * fundo #0F1115 + dourado #D4A84C, Sora (títulos) + Inter (corpo).
 * Tema escuro fixo — o produto real não tem alternância claro/escuro.
 *
 * Esta é a ÚNICA fonte de cor/fonte/raio/animação do projeto: nenhum
 * componente de `packages/ui` nem página das 4 apps pode carregar hex.
 *
 * As 4 apps consomem via `presets: [require('@barbervp/config/tailwind-preset')]`.
 */

const { colors } = require('./tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Superfícies (escala do SPEC: --bg / --surface / -2 / -3) ──────
        // O protótipo tem meio-tons fora da escala (#15171C nas sheets,
        // #1A1D23 nos inputs, #20242C no onboarding); todos foram
        // aproximados para o degrau mais próximo desta escala.
        bg: colors.bg,
        surface: {
          DEFAULT: colors.surface, // sheets, modais, superfície elevada da app
          2: colors.surface2, // cards do dashboard, campos de formulário
          3: colors.surface3, // cards internos, chips, menus (absorve o #20242C)
        },
        border: {
          DEFAULT: colors.line,
          strong: colors.line2,
        },

        // ── Marca ─────────────────────────────────────────────────────────
        // Fundos translúcidos saem por modificador de opacidade
        // (`bg-gold/10`, `border-gold/30`), como o protótipo faz com rgba().
        gold: {
          DEFAULT: colors.gold,
          hover: colors.goldHover,
        },

        // ── Semânticas ────────────────────────────────────────────────────
        success: colors.success,
        // Token único de erro — o protótipo tinha #E05B5B (produto) e
        // #E5484D (sheets do cliente); unificado em #E05B5B por SPEC.md.
        danger: colors.danger,
        info: colors.info,
        warning: colors.warning,

        // ── Texto ─────────────────────────────────────────────────────────
        // Contraste medido sobre as 4 superfícies acima:
        //   fg       17.02–14.18 → AAA em todas
        //   fg-muted  7.26–6.05  → AA em todas (AAA sobre bg/surface)
        //   fg-subtle 3.03–2.52  → NÃO passa AA: uso restrito a placeholder
        //                          e ornamento, nunca a texto informativo.
        fg: {
          DEFAULT: colors.fg, // primário
          muted: colors.fgMuted, // secundário
          subtle: colors.fgSubtle, // mudo — ver restrição acima
        },
      },

      fontFamily: {
        // Carregadas via next/font em cada app e expostas como CSS vars.
        display: ['var(--font-sora)', 'Sora', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        // Toque editorial permitido só em headlines de marketing do site.
        editorial: ['var(--font-playfair)', 'Playfair Display', 'Georgia', 'serif'],
      },

      borderRadius: {
        // A escala padrão do Tailwind (lg 8 · xl 12 · 2xl 16 · 3xl 24) já é
        // exatamente a do protótipo; só falta o degrau de 10px dos controles.
        control: '0.625rem', // 10px — inputs, botões médios, chips de horário
      },

      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.32), 0 8px 24px rgba(0,0,0,.24)',
        // Sheet mobile sobe de baixo; modal desktop paira no centro.
        sheet: '0 -8px 32px rgba(0,0,0,.5)',
        modal: '0 24px 64px rgba(0,0,0,.5)',
        menu: '0 12px 32px rgba(0,0,0,.45)',
        toast: '0 8px 24px rgba(0,0,0,.4)',
        gold: '0 0 0 1px rgba(212,168,76,.28), 0 8px 28px rgba(212,168,76,.14)',
      },

      screens: {
        // Piso de responsividade do projeto: 360px (regra inviolável 1).
        xs: '360px',
      },

      transitionTimingFunction: {
        // Curva das sheets do protótipo (translateY 300ms).
        sheet: 'cubic-bezier(.32,.72,0,1)',
      },

      // ── Animações reais portadas do bundle (SPEC.md → Design system) ──
      // Valores conferidos um a um contra os `@keyframes` dos `.dc.html`.
      keyframes: {
        bvpFade: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        bvpUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
        bvpPop: {
          '0%': { opacity: '0', transform: 'scale(.7)' },
          '60%': { transform: 'scale(1.08)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bvpGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212,168,76,0)' },
          '50%': { boxShadow: '0 0 38px 6px rgba(212,168,76,.30)' },
        },
        bvpRing: {
          from: { strokeDashoffset: '201' },
          to: { strokeDashoffset: '0' },
        },
        bvpCheck: {
          from: { strokeDashoffset: '48' },
          to: { strokeDashoffset: '0' },
        },
        bvpInLeft: {
          from: { opacity: '0', transform: 'translateX(-22px)' },
          to: { opacity: '1', transform: 'none' },
        },
        // Espelho do `bvpInLeft`, para o passo do wizard entrar pelo lado certo:
        // avançar desliza da direita, voltar desliza da esquerda. O protótipo
        // obtinha isso com um track de 400% que translada; ver a decisão da
        // fase 04 no CONTEXT.md.
        bvpInRight: {
          from: { opacity: '0', transform: 'translateX(22px)' },
          to: { opacity: '1', transform: 'none' },
        },
        bvpRise: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
        bvpFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        bvpFadeBg: {
          from: { opacity: '0', transform: 'scale(1.05)' },
          to: { opacity: '1', transform: 'none' },
        },
        // Padrão único de toast — substitui toastIn/wizToastIn/authToastIn/
        // contaToastIn/assinToastIn do protótipo (as 5 eram idênticas).
        // O `translate(-50%)` do original saiu daqui: quem centraliza é o
        // wrapper do `Toast`, senão a animação sobrescreve o transform.
        bvpToastIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // Confirmação de sucesso (successPop + checkDraw do protótipo).
        bvpSuccessPop: {
          from: { opacity: '0', transform: 'scale(.4)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        bvpCheckDraw: {
          from: { strokeDashoffset: '24' },
          to: { strokeDashoffset: '0' },
        },
        // Erro no código OTP.
        bvpOtpShake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        // Varredura do Skeleton (o protótipo usa bloco estático; o pulso é
        // adição nossa para dar sinal de carregamento).
        bvpShimmer: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.55' },
        },
      },
      animation: {
        'bvp-fade': 'bvpFade .28s ease-out both',
        'bvp-up': 'bvpUp .34s cubic-bezier(.22,.9,.3,1) both',
        'bvp-pop': 'bvpPop .32s cubic-bezier(.22,.9,.3,1) both',
        'bvp-glow': 'bvpGlow 2.2s ease-out infinite',
        'bvp-ring': 'bvpRing .7s ease-out forwards',
        'bvp-check': 'bvpCheck .4s .5s ease-out forwards',
        'bvp-in-left': 'bvpInLeft .3s ease-out both',
        'bvp-in-right': 'bvpInRight .3s ease-out both',
        'bvp-rise': 'bvpRise .42s cubic-bezier(.22,.9,.3,1) both',
        'bvp-float': 'bvpFloat 4s ease-in-out infinite',
        'bvp-fade-bg': 'bvpFadeBg .5s ease-out both',
        'bvp-toast-in': 'bvpToastIn .2s ease-out both',
        'bvp-success-pop': 'bvpSuccessPop .45s cubic-bezier(.34,1.56,.64,1) both',
        'bvp-check-draw': 'bvpCheckDraw .4s .35s ease-out both',
        'bvp-otp-shake': 'bvpOtpShake .3s ease-in-out',
        'bvp-shimmer': 'bvpShimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
