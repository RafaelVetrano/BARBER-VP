# BarberVP — Guia de execução do kit

## Como usar

1. Abra uma sessão **nova** do Claude Code (contexto limpo por agente).
2. Cole o conteúdo de `agentes/agente-01-fundacao.md`.
3. Ao terminar, confira os critérios de aceite da sessão e o `CONTEXT.md`
   atualizado (fase marcada ✅, endpoints, decisões, dívidas).
4. Repita com o próximo agente pendente, **sempre em sessão nova**.
5. **Nunca** avance para o próximo agente com a fase anterior quebrada.

## Ordem e dependências

```
01 Fundação
  └─▶ 02 Design system
        └─▶ 03 Auth & Tenancy
              ├─▶ 04 Booking público ──▶ 05 Área do cliente
              └─▶ 06 Dashboard I ──▶ 07 Dashboard II
                                          │
              08 Super Admin  ◀───────────┘  (depende de 03 + 07)
                    │
                    └─▶ 09 Integrações & Hardening (GATE FINAL — depende de todos)
```

- **04** e **06** dependem só de **03** (auth pronta) — podem rodar em
  paralelo se houver duas sessões, mas em execução sequencial siga a ordem
  numérica.
- **05** depende de **04** (o wizard de agendamento já precisa existir para
  a área do cliente consumir o motor de disponibilidade).
- **07** depende de **06** (o shell do dashboard e os módulos de operação
  precisam existir antes do financeiro).
- **08** depende de **03** (RBAC) e **07** (planos/feature flags já
  desenhados no financeiro).
- **09** é o gate final: só fecha com `make test` + `make test-isolation` +
  e2e verdes e varredura responsiva sem pendências.

## Se uma sessão estourar o contexto

O agente pode ser retomado: abra uma sessão nova, cole o **mesmo**
`agente-NN-*.md` e acrescente "continue de onde o `CONTEXT.md` indica".

## Regras invioláveis (repetir sempre)

1. Responsividade obrigatória (360px–1920px, tabelas viram cards no mobile).
2. Zero dado mockado no frontend — tudo vem da API, arrays do bundle viram seed.
3. Isolamento de tenant é sagrado — gate de aceite final.
4. Regras de negócio estruturais (anti double-booking, débito atômico,
   transação de comanda, feature gate server-side), não cosméticas.
5. Integrações externas atrás de adapters, drivers mock completos.
6. Segurança de produção desde o início (validação, RBAC, auditoria, LGPD).
