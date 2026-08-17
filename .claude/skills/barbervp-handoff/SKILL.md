---
name: barbervp-handoff
description: >
  Para uso no Claude Code. Transforma o bundle de telas do Claude Design do
  BARBER VP (SaaS multi-tenant de gestão de barbearias) em um kit de execução
  multi-agente para construir o sistema FULL STACK completo e profissional.
  Use SEMPRE que o usuário fornecer o .zip BARBER_VP, mencionar "barbervp",
  "handoff barbervp", "implementar o barbervp", "codar o barbervp" ou
  "transformar as telas do barbervp em sistema real". A skill: (1) desempacota
  o zip, (2) lê todas as 12 telas .dc.html, (3) aplica o mapa de sistemas
  pré-definido do BarberVP, (4) gera o kit completo de uma vez — README.md
  específico do projeto + pasta agentes/ com SPEC.md, CONTEXT.md, guia e
  todos os agentes prontos para execução sequencial.
---

# BarberVP — Handoff → Produção (multi-agente, Claude Code)

Esta skill roda no Claude Code. Recebe o `.zip` das telas do BarberVP exportadas
do Claude Design, lê o bundle inteiro, aplica o mapa de sistemas **pré-resolvido**
do projeto (não há detecção genérica — o escopo do BarberVP já está definido), e
escreve o kit de execução no disco — dois resultados concretos:

1. **`README.md` do bundle atualizado** — briefing específico do BarberVP,
   com design system real, mapa de telas → superfícies e regras invioláveis.
2. **Pasta `agentes/` criada** — kit completo de uma vez: `SPEC.md`,
   `CONTEXT.md`, `00-guia-de-uso.md` e todos os `agente-NN-*.md`.

Estratégia central: **fases sequenciais, `CONTEXT.md` como memória entre
sessões, fidelidade visual ao protótipo + responsividade obrigatória**.
Cada agente roda numa sessão separada do Claude Code (contexto limpo).

---

## O que o BarberVP É (contexto fixo — não rediscutir)

SaaS multi-tenant de gestão de barbearias. **NÃO é MVP** — é um produto
profissional de mercado. Quatro superfícies:

1. **Site institucional/vendas** (`apps/site`) — landing de vendas do SaaS,
   cadastro e login de estabelecimentos. SEO importa.
2. **Booking público + área do cliente** (`apps/booking`) — página pública da
   barbearia (por slug do tenant), wizard de agendamento, auth do cliente
   (OTP para guest booking), Minha Conta, assinaturas/fidelidade do cliente.
   Mobile-first: a maioria dos clientes agenda pelo celular.
3. **Dashboard da barbearia** (`apps/dashboard`) — Agenda, Comandas (POS),
   Clientes, Serviços, Produtos, Equipe, Financeiro, Comissões,
   Assinaturas, Fidelidade, Relatórios, Configurações. Inclui a visão
   restrita do funcionário (DashboardFuncionario).
4. **Super Admin** (`apps/admin`) — gestão do SaaS: CRUD de tenants, planos
   do SaaS com feature flags, billing das barbearias (adapter Asaas mock).

## Regras invioláveis (repetir em TODOS os agentes gerados)

1. **Responsividade obrigatória** — os `.dc.html` são desktop-fixos. Todo
   layout deve ser reconstruído mobile-first e funcionar de 360px a 1920px.
   Ver `references/responsividade.md`. Fidelidade visual = mesmas cores,
   fontes, espaçamentos e hierarquia — NÃO mesma largura fixa.
2. **Zero dado mockado no frontend** — todo dado vem da API. Os arrays
   hardcoded dos `.dc.html` viram `seed.ts` do Prisma, nunca constantes
   no cliente.
3. **Isolamento de tenant é sagrado** — `tenantId` em todo modelo de dados
   de negócio, guard global no NestJS, e a suíte de testes de isolamento
   (agente final) é gate de aceite. Vazamento entre tenants = fase reprovada.
4. **Regras de negócio estruturais, não cosméticas** — anti double-booking
   via EXCLUDE constraint no PostgreSQL; débito de uso de assinatura
   atômico; fechamento de comanda em transação única; gates de feature por
   plano aplicados server-side (nunca só esconder botão).
5. **Integrações externas atrás de adapters** — WhatsApp e gateway de
   pagamento (Asaas) NÃO entram agora: definir interfaces
   (`NotificationAdapter`, `PaymentAdapter`) com drivers **mock** completos
   e funcionais. Plugar o real depois não pode exigir refatoração.
6. **Segurança de produção desde o início** — validação em todo endpoint
   (class-validator/Zod), helmet, CORS restrito, rate limit, bcrypt/argon2,
   JWT access curto + refresh httpOnly, RBAC por papel, auditoria de ações
   sensíveis, LGPD (consentimento, exportação e exclusão de dados do cliente).

---

## Fluxo de execução

1. **Desempacotar** — extrair o zip no diretório atual se ainda não extraído
2. **Explorar o bundle** — ler TODAS as 12 telas `.dc.html` (ordem abaixo)
3. **Aplicar o mapa de sistemas** — `references/system-map.md` (pré-resolvido)
4. **Stack** — fixa, em `references/stack.md` (NestJS + Next.js 14, não rediscutir)
5. **Modelo de dados** — `references/data-model.md` como base do schema Prisma
6. **Montar o plano** — os 9 agentes de `references/agent-templates.md`
7. **Gerar todos os arquivos de uma vez** — SPEC, CONTEXT, guia e agentes
8. **Escrever no disco** — README.md do bundle + pasta `agentes/`
9. **Confirmar** — listar arquivos criados e a ordem de execução

Gere **todos os prompts de agente de uma só vez**. Não entregue aos poucos.

---

## Fase 1 — Desempacotar e explorar

```bash
unzip BARBER_VP.zip -d .
```

**Leia as telas nesta ordem** (agrupadas por superfície):

| # | Arquivo | Superfície | O que extrair |
|---|---|---|---|
| 1 | `BarberVP Vendas.dc.html` | site | Landing, planos do SaaS, copy |
| 2 | `BarberVP Cadastro Estabelecimento.dc.html` | site | Fluxo de cadastro do tenant |
| 3 | `BarberVP Login Estabelecimento.dc.html` | site | Login owner/staff |
| 4 | `BarberVP Configurar Barbearia.dc.html` | dashboard | Onboarding pós-cadastro |
| 5 | `Agendamento Publico.dc.html` | booking | Página pública da barbearia |
| 6 | `AgendamentoWizard.dc.html` | booking | Wizard: serviço → barbeiro → horário → confirmação. **Fonte de verdade de serviços, preços, durações e barbeiros** |
| 7 | `ClienteAuth.dc.html` | booking | Auth cliente + OTP guest |
| 8 | `MinhaConta.dc.html` | booking | Conta do cliente, LGPD, notificações |
| 9 | `AssinaturaCliente.dc.html` | booking | Planos de assinatura/fidelidade do cliente |
| 10 | `Dashboard.dc.html` | dashboard | TODOS os módulos internos (arquivo grande ~570KB — ler por inteiro, é a fonte de verdade do dashboard) |
| 11 | `DashboardFuncionario.dc.html` | dashboard | Visão restrita do barbeiro |
| 12 | `CadastroFuncionario.dc.html` | dashboard | Convite/cadastro de equipe |

Use `view` para ler cada arquivo. Não suponha — leia o código. Ignorar a
pasta `uploads/` (duplicatas) e `screenshots/` (referência visual apenas).

**Registre ativamente:** rotas/abas, campos e enums dos arrays de dados,
handlers e nomes de estado existentes (reusar nomes ao portar), cores HEX,
`@keyframes`, componentes recorrentes (cards, modais, drawers, tabelas),
estados vazios, textos reais.

**Design system real (já verificado no bundle — confirmar ao ler):**
- Fundos: `#0F1115` (base), `#12151A`, `#181B21`, `#1F232B` (cards), `#2A2F38` (bordas/hover)
- Acento: dourado `#D4A84C` · Sucesso: `#3FB68B` · Erro: `#E05B5B` · Info: `#5B8DE0` · Alerta: `#E8A13C`
- Texto: `#F2F3F5` (primário), `#9AA1AC` (secundário), `#5B616B` (mudo)
- Fontes: **Sora** (títulos, 700) + **Inter** (corpo, 400–700)
- Tema escuro em todas as superfícies

---

## Fase 2 — Sistemas e plano

Não há detecção: o mapa está fechado em `references/system-map.md`.
Os 9 agentes (ordem e escopo) estão em `references/agent-templates.md`:

1. **Fundação** — Turborepo, Docker, NestJS skeleton, Prisma schema completo, seed
2. **Design system** — pacote `packages/ui` compartilhado, tokens, primitives responsivos
3. **Auth & Tenancy** — auth estabelecimento + cliente (OTP), RBAC, onboarding
4. **Booking público** — site da barbearia + wizard + anti double-booking
5. **Área do cliente** — Minha Conta, assinaturas do cliente, LGPD
6. **Dashboard I** — Agenda, Clientes, Serviços, Produtos, Equipe + visão funcionário
7. **Dashboard II** — Comandas (POS), Comissões, Financeiro, Relatórios, Fidelidade, Configurações
8. **Super Admin** — tenants, planos SaaS, feature flags, billing mock
9. **Integrações mock & hardening** — adapters WhatsApp/Asaas, BullMQ, testes de isolamento (GATE), polish

Regra de avanço: **nenhum agente começa se o anterior estiver quebrado.**

---

## Fase 3 — Gerar o conteúdo dos arquivos

**`README.md` (substitui o do bundle):** estrutura de
`references/guide-template.md` adaptada. Conter: o que o BarberVP é, mapa
tela→superfície (tabela acima preenchida com o que foi lido), design system
real extraído, as 6 regras invioláveis, apontar `agentes/SPEC.md` como fonte
de verdade técnica.

**`agentes/SPEC.md`:** `references/spec-template.md`. Enxuto — apontar para
os `.dc.html` como fonte de verdade de seeds/enums em vez de duplicar.
Cores/fontes/animações REAIS.

**`agentes/CONTEXT.md`:** `references/context-template.md`. Tabela de status
das 9 fases.

**`agentes/00-guia-de-uso.md`:** `references/guide-template.md`. Agentes
reais, passo a passo, diagrama de dependências.

**`agentes/agente-NN-nome.md`:** templates de `references/agent-templates.md`
preenchidos com dados REAIS do bundle (arquivos, componentes, serviços,
barbeiros, módulos). Um kit genérico não serve.

Princípios de cada agente:
- Começa lendo `CONTEXT.md` + `SPEC.md` + só os `.dc.html` da fase
- Termina atualizando `CONTEXT.md` (fase ✅, endpoints, decisões, dívidas)
- Imperativo, escopo explícito (o que entra / o que NÃO entra)
- Reforça as 6 regras invioláveis, em especial responsividade e isolamento
  de tenant

---

## Fase 4 — Escrever no disco e confirmar

```bash
mkdir -p agentes
```

Escrever com `create_file`: README.md do bundle (sobrescrever),
`agentes/SPEC.md`, `agentes/CONTEXT.md`, `agentes/00-guia-de-uso.md`,
`agentes/agente-01-fundacao.md` … `agentes/agente-09-integracoes-hardening.md`.

Confirmar:
```bash
echo "=== README.md ===" && head -3 README.md
echo "=== agentes/ ===" && ls -1 agentes/
```

Resumo final ao usuário: superfícies, stack (uma linha), 9 agentes na ordem,
próximo passo: "Abra uma nova sessão do Claude Code e cole o conteúdo de
`agentes/agente-01-fundacao.md`."

---

## Arquivos de referência

- `references/system-map.md` — mapa fechado tela → sistema → fase
- `references/stack.md` — stack fixa do BarberVP (NestJS + Next.js 14)
- `references/data-model.md` — base do schema Prisma multi-tenant
- `references/responsividade.md` — regras de responsividade por superfície
- `references/agent-templates.md` — templates dos 9 agentes (coração da skill)
- `references/spec-template.md` — estrutura do SPEC.md
- `references/context-template.md` — estrutura do CONTEXT.md
- `references/guide-template.md` — estrutura do guia e README

Os templates são pontos de partida — preencha sempre com os dados REAIS do bundle.
