# Estrutura do guia de uso e do README

## `agentes/00-guia-de-uso.md`

```
# BarberVP — Guia de execução do kit

## Como usar
1. Abra uma sessão NOVA do Claude Code (contexto limpo por agente)
2. Cole o conteúdo de `agentes/agente-01-fundacao.md`
3. Ao terminar, confira os critérios de aceite e o CONTEXT.md atualizado
4. Repita com o próximo agente, sempre em sessão nova
5. NUNCA avance com o agente anterior quebrado

## Ordem e dependências
01 Fundação → 02 Design system → 03 Auth & Tenancy → 04 Booking público
→ 05 Área do cliente → 06 Dashboard I → 07 Dashboard II → 08 Super Admin
→ 09 Integrações & Hardening (GATE)

[Diagrama simples de dependências. 04 e 06 dependem de 03; 05 depende de 04;
07 depende de 06; 08 depende de 03+07; 09 depende de todos.]

## Se uma sessão estourar o contexto
O agente pode ser retomado: abrir sessão nova, colar o MESMO agente e
acrescentar "continue de onde o CONTEXT.md indica".

## Regras invioláveis
[As 6 regras.]
```

## `README.md` do bundle (sobrescreve o original)

```
# BarberVP — Handoff bundle

## O que é este projeto
[Parágrafo: SaaS multi-tenant de barbearias, 4 superfícies, não-MVP.]

## Como ler este bundle
[Tabela das 12 telas → superfície → o que extrair (a mesma do SKILL.md,
confirmada com o que foi lido). Avisar: ignorar uploads/ e screenshots/;
os dados hardcoded viram seed, nunca constantes de frontend.]

## Design system real
[Cores HEX, fontes, keyframes extraídos.]

## Regra-mestre
Fidelidade visual (cores/fontes/hierarquia) + responsividade obrigatória
(os .dc.html são desktop-fixos; reconstruir mobile-first, 360→1920px).

## Fonte de verdade técnica
`agentes/SPEC.md`. Estado do projeto: `agentes/CONTEXT.md`.
Execução: `agentes/00-guia-de-uso.md`.
```
