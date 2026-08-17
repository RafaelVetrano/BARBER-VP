# Estrutura do `agentes/SPEC.md`

Fonte de verdade técnica. Enxuto: apontar para os `.dc.html` como fonte de
seeds/enums em vez de duplicar conteúdo.

```
# BarberVP — SPEC

## O que é
[2-3 linhas: SaaS multi-tenant de gestão de barbearias, 4 superfícies,
não-MVP.]

## Stack (fixa)
[Resumo de references/stack.md em ~10 linhas: monorepo, NestJS+Prisma+PG16+
Redis/BullMQ, 4 apps Next.js 14, packages compartilhados, adapters mock.]

## Superfícies e telas
[Tabela tela → app → rota, preenchida com o que foi lido no bundle.]

## Design system
- Cores: [HEX reais]
- Fontes: Sora (títulos) + Inter (corpo)
- Animações: [@keyframes reais extraídos]
- Tema escuro em todas as superfícies
- Tokens vivem em packages/config (preset Tailwind) — única fonte

## Modelo de dados
[Resumo de references/data-model.md: lista de modelos por grupo
(globais/por-tenant), constraints críticas (EXCLUDE, débito atômico,
transação da comanda). Campos/enums exatos: ler nos .dc.html —
AgendamentoWizard para serviços/barbeiros, Dashboard para o resto.]

## Papéis e permissões
[Tabela papel → o que acessa, conforme system-map.md.]

## Regras invioláveis
[As 6 regras, na íntegra.]

## Convenções
- API REST /api/v1, JSON, erros { code, message, details? }
- Money em centavos (Int); datas UTC; timezone por tenant
- Nomes de schema em inglês; UI em pt-BR
- Commits convencionais; branch por agente opcional

## Fora de escopo desta fase
- WhatsApp real, Asaas real, e-mail real (drivers mock prontos p/ troca)
```
