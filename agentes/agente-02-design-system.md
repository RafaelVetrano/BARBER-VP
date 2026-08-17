# Agente 02 — Design system (`packages/ui`)

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade, segurança e responsividade de produto profissional.

## Leia primeiro

1. `agentes/CONTEXT.md` — confirmar fase 01 ✅
2. `agentes/SPEC.md` — seção Design system (cores, fontes, animações, decisão de unificação)
3. `.dc.html` desta fase: `Dashboard.dc.html` e `AgendamentoWizard.dc.html`
   (os mais ricos em componentes — leia os estilos inline e os `sc-if`/
   `sc-for` para identificar todos os padrões de UI recorrentes), mais os
   estilos globais (`<helmet><style>`) de `BarberVP Configurar Barbearia.dc.html`,
   `ClienteAuth.dc.html`, `MinhaConta.dc.html` e `AssinaturaCliente.dc.html`
   para os keyframes e o padrão de sheet mobile-first (bottom-sheet <
   768px, modal centrado ≥ 768px, detectado no protótipo via
   `ResizeObserver`/`window.innerWidth`).

## Regras invioláveis (valem nesta sessão)

1. Responsividade obrigatória — os primitives nascem responsivos.
2. Zero dado mockado — nesta fase não há dados, só componentes; não portar
   os arrays de exemplo como se fossem parte do design system.
3. Isolamento de tenant não se aplica diretamente aqui, mas nenhum token de
   cor/marca pode ficar hardcoded fora de `packages/config` (branding por
   tenant vem na fase 07 via `TenantSettings`).
4. N/A nesta fase (sem regra de negócio).
5. N/A nesta fase (sem integração externa).
6. Acessibilidade é segurança de produto: foco visível, aria em
   modais/drawers, contraste do tema escuro validado.

## Sua tarefa nesta sessão

Escopo: portar o design system dos `.dc.html` para componentes React
compartilhados, responsivos, tipados, em `packages/ui`. NÃO entra: nenhuma
página real de produto (isso é das fases 03+).

### Tokens (Tailwind preset em `packages/config`)
- Cores: `--bg:#0F1115`, `--surface:#12151A`, `--surface-2:#181B21`,
  `--surface-3:#1F232B` (unificar com o `#20242C` do onboarding — usar
  `#1F232B`, mais usado), `--line:#2A2F38`, `--line-2:#343B46`,
  `--gold:#D4A84C`, `--gold-2:#E6BE66`, `--green:#3FB68B`,
  `--red:#E05B5B` (usar em todo lugar, inclusive onde o protótipo do cliente
  usa `#E5484D` — consolidar em um único vermelho), `--info:#5B8DE0`,
  `--alert:#E8A13C`, `--txt:#F2F3F5`, `--txt-2:#9AA1AC`, `--txt-3:#5B616B`.
- Fontes: Sora (700, títulos) + Inter (400–900, corpo/UI) via
  `next/font` — não usar Google Fonts CDN direto nas 4 apps de produção.
- Radii: 8–16px conforme os componentes do protótipo (botões ~10–12px,
  cards ~12–16px, sheets ~20–24px no topo).
- `@keyframes` reais (nomes conforme `SPEC.md` → Design system):
  `bvpFade`, `bvpUp`, `bvpPop`, `bvpGlow`, `bvpRing`, `bvpCheck`,
  `bvpInLeft`, `bvpRise`, `bvpFloat`, `bvpFadeBg`, `otpShake`,
  `successPop`, `checkDraw`. Consolidar as 5 variações de toast
  (`toastIn`/`wizToastIn`/`authToastIn`/`contaToastIn`/`assinToastIn`, todas
  idênticas: fade + translateY(8px)→0) em **uma única** `@keyframes
  toastIn`.

### Ícones
Portar os SVGs inline do protótipo (outline, `stroke-width` 1.6–2.6) como
componentes React tipados em `packages/ui/icons` — NÃO trocar por lucide ou
outra lib, para manter fidelidade visual exata (o protótipo usa paths
customizados, ex. o ícone de tesoura/agenda do nav do dashboard).

### Primitives
Construir, com tipagem completa e estados hover/focus/disabled/loading:

- `Button` (variantes: primary dourado, outline, ghost/texto — ver estilos
  de `onHeroCta`, botões de wizard `nextBtnStyle`).
- `Input`, `Textarea`, `Select` (com estado de erro em vermelho e sucesso
  com check verde — padrão visto em todos os formulários de auth).
- `OtpInput` (6 caixas, auto-advance, paste, shake em erro — extraído de
  `ClienteAuth.dc.html`).
- `PasswordInput` (toggle mostrar/ocultar + indicador de força de 4 barras
  — extraído de `ClienteAuth.dc.html`/`CadastroFuncionario.dc.html`).
- `Modal`/`Drawer` — portal, scroll lock, **bottom-sheet abaixo de 768px,
  modal centrado ≥ 768px** (padrão real do protótipo em `ClienteAuth`,
  `MinhaConta`, `AgendamentoWizard`, `AssinaturaCliente` — todos usam esse
  mesmo breakpoint com `ResizeObserver`).
- `Card`, `Badge`/`StatusPill` (cores por status: confirmado/verde,
  pendente/dourado, cancelado/vermelho — ver `STATUS_STYLE` do Dashboard),
  `Tabs` (roláveis horizontalmente no mobile — ver tabs de
  Agendamentos/Assinatura/Dados em `MinhaConta.dc.html`).
- `ResponsiveTable` (tabela ≥ `md`, lista de cards < `md` com as 2–3
  colunas mais importantes e ações em menu kebab).
- `Toast` único (consolidando as 5 variações), `SuccessScreen` (círculo
  dourado + check animado + resumo — consolidando as 2 variações de
  sucesso do booking e da assinatura).
- `EmptyState` (ilustração SVG simples + texto + CTA — ver "Você ainda não
  tem horários marcados" em `MinhaConta.dc.html`).
- `Skeleton` (usado no carregamento de slots do wizard).
- `Avatar` (iniciais sobre gradiente dourado quando sem foto — padrão
  recorrente em barbeiro/cliente).
- `DatePicker`/`DayPill` (chips de dia com indicador de "sem vagas") e
  `TimeChip` (grade de horários) — extraídos de `AgendamentoWizard.dc.html`.
- `StatCard` (número grande + label + variação — dashboard e landing de
  vendas).
- `AppShell` do dashboard: sidebar colapsável fixa ≥ `lg`, drawer
  sobreposto < `lg`, topbar com botão de menu — extraído do nav de
  `Dashboard.dc.html`/`DashboardFuncionario.dc.html`.

### Página de inspeção visual
Storybook OU uma rota `/playground` em `apps/dashboard` que renderiza todos
os primitives nos 3 breakpoints de referência (360/768/1440).

## Critérios de aceite

- Playground/Storybook renderiza todos os primitives em 360/768/1440 sem
  quebra visual.
- Zero cor ou fonte fora dos tokens de `packages/config` (buscar por hex
  hardcoded fora do preset deve dar zero resultados nos componentes).
- `Modal`/`Drawer` comprovadamente vira bottom-sheet < 768px e modal
  centrado ≥ 768px, com scroll interno e fechamento acessível (ESC, overlay
  click, botão ✕).
- Contraste de texto sobre os fundos do tema escuro passa AA.

## Ao finalizar

Atualizar `agentes/CONTEXT.md`: fase 02 ✅, lista de componentes criados em
`packages/ui`, decisões (ex.: nome final de cada primitive, se divergiu do
sugerido acima), dívidas técnicas (ex.: algum componente do protótipo que
ficou para depois).
