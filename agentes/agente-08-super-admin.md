# Agente 08 — Super Admin

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade, segurança e responsividade de produto profissional.

## Leia primeiro

1. `agentes/CONTEXT.md` — confirmar fases 01–03 e 07 ✅
2. `agentes/SPEC.md` — Papéis e permissões (SUPER_ADMIN), Feature flags,
   Modelo de dados (Tenant/SaasPlan/TenantSubscription)
3. Não há tela de `apps/admin` no bundle — não existe `.dc.html` desta fase.
   Seguir o design system consolidado na fase 02 (`packages/ui`) e o mesmo
   padrão de shell do `apps/dashboard` (fase 06).

## Regras invioláveis (valem nesta sessão)

1. Responsividade obrigatória — mesmo padrão do dashboard (sidebar
   drawer/fixa, tabelas viram cards).
2. Zero dado mockado — métricas da plataforma vêm de agregação real, não
   de números fixos.
3. Isolamento de tenant é sagrado — o super admin **enxerga** todos os
   tenants por design (é a exceção documentada), mas cada ação sobre um
   tenant específico é auditada com o `tenantId` afetado.
4. Regras de negócio estruturais: troca de plano de um tenant deve
   refletir imediatamente nos feature flags que o dashboard daquele tenant
   consulta (mesmo mapa `FEATURE_TIER` da fase 07).
5. Billing via `PaymentAdapter` mock — mesmo adapter das fases 05/07, não
   criar um novo.
6. Segurança: rota `/admin/*` com guard próprio (`SUPER_ADMIN`, fora do
   conceito de tenant), impersonar `OWNER` com auditoria pesada (log
   detalhado + banner visual obrigatório na sessão impersonada).

## Sua tarefa nesta sessão

Escopo: `apps/admin` completo — gestão do SaaS. NÃO entra: gateway de
pagamento real.

### Tarefas backend

- Papel `SUPER_ADMIN` fora do conceito de tenant; guard próprio nas rotas
  `/admin/*`.
- CRUD de `SaasPlan`: nome, preço, `maxBarbeiros`, `features Json` — usar
  exatamente o mapa de `SPEC.md` → Feature flags como schema de opções
  (não inventar features novas sem necessidade).
- Tenants: listar/buscar (nome, slug, status, plano, uso — nº barbeiros,
  nº agendamentos no mês), detalhes com métricas, suspender/reativar
  (suspensão bloqueia login de todo `Membership` daquele tenant), trocar
  plano manualmente, **impersonar** `OWNER` (gera um token de sessão
  especial, auditoria pesada, expira rápido).
- Billing das barbearias via `PaymentAdapter` mock: ciclo de cobrança
  simulado (job BullMQ), aprovar/recusar cobrança manualmente para testar
  fluxo de inadimplência → `Tenant.status = SUSPENDED` automático após N
  falhas.
- Métricas da plataforma: MRR (soma dos planos ativos), tenants ativos por
  plano, churn (cancelamentos no período) — tudo agregado via SQL real.

### Tarefas frontend (`apps/admin`)

- Shell igual ao padrão do `apps/dashboard` (mesmo `AppShell` de
  `packages/ui`), nav: Tenants, Planos, Billing, Métricas.
- Módulos acima, responsivos, seguindo os mesmos tokens de design da fase
  02 — sem tela de referência do bundle, então a fidelidade aqui é ao
  *sistema* (cores, tipografia, componentes), não a um layout específico.

## Critérios de aceite

- Criar um plano novo, trocar o plano de um tenant e ver o feature flag
  refletir imediatamente no dashboard daquele tenant (403 antes, 200 +
  upsell removido depois — ou o inverso).
- Suspender um tenant bloqueia login de todos os seus `Membership`s.
- Impersonar `OWNER` gera entrada de auditoria e exibe banner visível na
  sessão impersonada.

## Ao finalizar

Atualizar `agentes/CONTEXT.md`: fase 08 ✅, endpoints criados, decisões de
layout (já que não havia tela de referência), dívidas técnicas.
