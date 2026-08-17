# Estrutura do `agentes/CONTEXT.md`

Memória entre sessões do Claude Code. Todo agente lê no início e atualiza no
final. Manter curto — é resumo, não log.

```
# BarberVP — CONTEXT (memória entre sessões)

Atualizado por último: [data] — [agente NN]

## Status das fases
| # | Fase | Status |
|---|---|---|
| 01 | Fundação | ⬜ |
| 02 | Design system | ⬜ |
| 03 | Auth & Tenancy | ⬜ |
| 04 | Booking público | ⬜ |
| 05 | Área do cliente | ⬜ |
| 06 | Dashboard I | ⬜ |
| 07 | Dashboard II | ⬜ |
| 08 | Super Admin | ⬜ |
| 09 | Integrações & Hardening | ⬜ |

(⬜ pendente · 🟨 em andamento · ✅ concluída — só marcar ✅ com critérios
de aceite verdes; NUNCA avançar com fase anterior quebrada)

## Endpoints existentes
[Lista viva por módulo, atualizada a cada fase.]

## Decisões tomadas
[Data — decisão — motivo. Ex.: nome de enum divergiu do protótipo porque X.]

## Dívidas técnicas
[Item — fase de origem — fase que deve resolver.]

## Como retomar
Abrir sessão nova do Claude Code → colar o próximo agente-NN pendente.
```
