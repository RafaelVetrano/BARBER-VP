# Mapa de sistemas do BarberVP (pré-resolvido)

Não há detecção genérica. Este mapa é fixo. Se o bundle contiver algo que
contradiga o mapa, **pergunte antes de gerar**.

## Superfícies → apps do monorepo

| Superfície | App | Telas do bundle | SEO |
|---|---|---|---|
| Site institucional/vendas do SaaS | `apps/site` (Next.js, SSR/SSG) | Vendas, Cadastro Estabelecimento, Login Estabelecimento | Sim |
| Booking público + área do cliente | `apps/booking` (Next.js, rota `/{slugDaBarbearia}`) | Agendamento Publico, AgendamentoWizard, ClienteAuth, MinhaConta, AssinaturaCliente | Sim (página pública do tenant) |
| Dashboard da barbearia | `apps/dashboard` (Next.js, CSR-heavy) | Configurar Barbearia (onboarding), Dashboard, DashboardFuncionario, CadastroFuncionario | Não (noindex) |
| Super Admin do SaaS | `apps/admin` (Next.js, CSR) | — sem tela no bundle; construir seguindo o design system | Não (noindex) |

## Sistemas → fase responsável

| Sistema | Sinais no bundle | Fase (agente) |
|---|---|---|
| Infra multi-tenant, schema, seed | dados hardcoded em todas as telas | 01 Fundação |
| Design system compartilhado | mesmos tokens/tema escuro em todas as telas | 02 Design system |
| Auth estabelecimento (owner/staff) | Login/Cadastro Estabelecimento | 03 Auth & Tenancy |
| Auth cliente + OTP guest | ClienteAuth | 03 Auth & Tenancy |
| Onboarding do tenant | Configurar Barbearia | 03 Auth & Tenancy |
| Página pública + wizard de agendamento | Agendamento Publico, AgendamentoWizard | 04 Booking público |
| Anti double-booking | slots do wizard | 04 Booking público (EXCLUDE constraint criada na 01) |
| Conta do cliente + LGPD + preferências | MinhaConta | 05 Área do cliente |
| Assinatura/fidelidade do cliente | AssinaturaCliente | 05 Área do cliente |
| Agenda interna, Clientes, Serviços, Produtos, Equipe | Dashboard (abas), CadastroFuncionario | 06 Dashboard I |
| Visão restrita do funcionário | DashboardFuncionario | 06 Dashboard I |
| Comandas/POS, Comissões, Financeiro, Relatórios, Fidelidade (gestão), Configurações | Dashboard (abas) | 07 Dashboard II |
| Planos do SaaS + feature flags + tenants + billing das barbearias | Vendas (planos) + requisito de negócio | 08 Super Admin |
| Notificações (WhatsApp mock), pagamentos (Asaas mock), filas, e-mails | requisito de negócio | 09 Integrações & Hardening |
| Testes de isolamento de tenant (GATE) | requisito inviolável | 09 (suite criada na 01, ampliada em toda fase) |

## Papéis (RBAC)

- `SUPER_ADMIN` — plataforma (apps/admin)
- `OWNER` — dono da barbearia (dashboard completo, conforme plano)
- `MANAGER` — gerente (dashboard completo exceto configurações de billing)
- `BARBER` — funcionário (DashboardFuncionario: própria agenda, próprias comissões, comandas que atende)
- `CLIENT` — cliente global da plataforma (perfil por barbearia)

## Fora de escopo NESTA fase (deixar interface pronta, driver mock)

- API oficial do WhatsApp (Meta/terceiros) → `NotificationAdapter` mock
- Gateway Asaas real (cobranças, webhooks) → `PaymentAdapter` mock
- Qualquer outro gateway/integração externa
