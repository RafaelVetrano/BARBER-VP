# Responsividade — regras obrigatórias

Os `.dc.html` do bundle são **desktop-fixos**. Responsividade não é opcional
nem "melhoria futura": é critério de aceite de TODAS as fases de frontend.

## Regra-mestre

Fidelidade visual = mesmas cores, fontes, hierarquia, espaçamento relativo e
componentes. **NÃO** = mesma largura fixa. Reconstruir cada layout
mobile-first com Tailwind, escalando para desktop.

## Breakpoints (Tailwind padrão)

- base: 360–639px (mobile) — layout de referência para `booking`
- `sm` 640 · `md` 768 · `lg` 1024 (dashboard ganha sidebar fixa aqui) ·
  `xl` 1280 · `2xl` 1536

Testar em 360, 390, 768, 1024, 1440. Nada de scroll horizontal em nenhuma
largura. Alvos de toque ≥ 44px em mobile.

## Padrões por superfície

**`apps/site` (vendas):** seções em coluna no mobile; grids de features/planos
1 col → 2 → 3; nav vira menu hambúrguer < `md`.

**`apps/booking` (mobile-first — a maioria agenda pelo celular):**
- Wizard: passos em tela cheia no mobile, um passo por vez; barra de progresso
  fixa; botão de avançar fixo no rodapé (safe-area iOS)
- Grade de horários: chips em grid fluido (`grid-cols-3 sm:grid-cols-4 ...`)
- MinhaConta/Assinatura: cards empilhados; tabs roláveis horizontalmente
- Em desktop, centralizar em coluna máx. ~480–560px (o protótipo já sugere)

**`apps/dashboard`:**
- Sidebar: drawer sobreposto < `lg`, fixa ≥ `lg`; topbar com botão de menu
- **Tabelas → cards no mobile**: toda tabela (clientes, produtos, comissões,
  relatórios) vira lista de cards < `md`, com as 2–3 colunas mais importantes;
  ações em menu kebab
- Agenda: dia único com scroll vertical no mobile; visão semana/colunas por
  barbeiro só ≥ `lg`
- Comanda (POS): duas colunas (catálogo | comanda) ≥ `lg`; no mobile, comanda
  como bottom-sheet/drawer com subtotal sempre visível
- Modais: tela cheia ou bottom-sheet < `md`; centrados ≥ `md`
- Gráficos: containers responsivos (largura 100%), legendas abaixo no mobile

**`apps/admin`:** mesmos padrões do dashboard.

## Checklist de aceite (repetir em todo agente de frontend)

- [ ] 360px sem scroll horizontal e sem elemento cortado
- [ ] Tabelas viram cards < `md`
- [ ] Modais/drawers utilizáveis no mobile (fechar acessível, scroll interno)
- [ ] Navegação completa acessível no mobile
- [ ] Imagens/gráficos fluidos
- [ ] Texto nunca menor que 12px; corpo ≥ 14px no mobile
- [ ] Testado nos 5 tamanhos de referência
