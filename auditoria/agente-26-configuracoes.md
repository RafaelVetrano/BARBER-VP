# Agente 26 — Auditoria 1:1 — Aba Configurações

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade de produto profissional. Esta sessão audita e corrige
**apenas** a área "Aba Configurações" do dashboard contra o protótipo do Claude
Design. As demais abas têm agentes próprios — não tocar nelas.

## Leia primeiro
1. `CONTEXT.md` — estado atual (agentes 13 e 14/seeds devem estar ✅)
2. `SPEC.md` — design system e a seção desta área
3. `Dashboard.dc.html` — **SOMENTE as linhas 2466–2736** e os modais
   listados abaixo. NÃO ler o arquivo inteiro (570KB — estourar o
   contexto aqui é o que causou as telas incompletas).
4. A implementação atual da rota correspondente em `apps/`

## Regras invioláveis (valem nesta sessão)
1. **Componente ≠ dado** — a ESTRUTURA (blocos, ordem, grids, cores,
   tipografia, interações) deve ficar 1:1 com o protótipo; os VALORES vêm
   sempre da API. PROIBIDO hardcodar qualquer número, nome ou valor do
   protótipo no frontend. Se falta endpoint, criar o endpoint.
2. **Todo botão tem função real** — nada de onClick vazio, console.log ou
   toast falso. Ação de outra aba = navegar para ela.
3. **Gates de plano server-side** — bloco com cadeado no protótipo mostra
   paywall/upsell no front E o endpoint retorna 403. Nunca só esconder.
4. **Estados obrigatórios** — loading (skeleton sem layout shift), vazio
   (mensagem própria por bloco; tenant novo renderiza a aba inteira sem
   quebrar), erro (retry local, sem derrubar a página).
5. **Papéis** — conferir a aba como OWNER e como BARBER; BARBER só vê o que
   o DashboardFuncionario permite.
6. **Responsividade** — 360/390/768/1024/1440; tabelas→cards < md; modais
   viram bottom-sheet < md; sem scroll horizontal; toque ≥ 44px.
7. **Isolamento de tenant** — todo endpoint novo ganha caso na suíte de
   isolamento; conferir visualmente logando no tenant secundário.

## Sua tarefa nesta sessão

### Passo 1 — Tabela de desvios (OBRIGATÓRIA, antes de qualquer correção)
Compare o protótipo (intervalo de linhas indicado) com a implementação e
preencha:

| Bloco do protótipo | Existe? | Layout igual? | Botões funcionam? | Ação |
|---|---|---|---|---|

Só depois de completa, corrija na ordem: estrutura → componentes →
interações → estados.

### Passo 2 — Inventário específico de Configurações
Sub-abas: **Barbearia** (l.2475), **Unidades** (l.2541), **Plano** (l.2622),
**Preferências** (l.2683).
Modais relacionados: `modalUpgrade` (l.3461); `modalTrocarPlano` (l.3483 —
com blocos de GANHOS l.3487 e PERDAS l.3495 na troca).

**Estrutura a garantir:**
- Barbearia: dados, horários de funcionamento, políticas de cancelamento.
- Unidades: gestão multi-unidade com gate de plano (item "+ Nova unidade"
  com cadeado quando bloqueado — mesmo padrão da topbar).
- Plano: plano atual, troca com resumo de ganhos/perdas, data de renovação.
- Preferências: intervalos de slot, notificações etc.

### Backend
- Troca de plano via PaymentAdapter mock; ganhos/perdas do modal calculados
  na API (diff real de features entre os tiers), nunca hardcoded.
- Downgrade dispara os efeitos colaterais (limite de barbeiros → Equipe).
- Horários alterados refletem no motor de disponibilidade.

## Critérios de aceite
- [ ] Tabela de desvios preenchida e, ao final, zerada
- [ ] Lado a lado com o protótipo renderizado: mesma ordem de blocos,
      mesmos grids, cores e tipografia
- [ ] Todos os botões, menus e modais da aba operando contra a API
- [ ] grep no diff: nenhum valor/nome do protótipo hardcodado
- [ ] Tenant demo cheio OK e tenant vazio OK (estados vazios corretos)
- [ ] Papel BARBER com a visão restrita correta
- [ ] Responsividade nos 5 tamanhos de referência

## Ao finalizar
Atualizar `CONTEXT.md`: fase ✅, endpoints criados/alterados, lista dos
desvios encontrados (alimenta as próximas auditorias) e dívidas técnicas.
