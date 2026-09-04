# Agente 30 — Configuração inicial da barbearia: obrigatória, sem saídas, e com os passos 2 e 3 refeitos

Projeto: **BarberVP** — SaaS multi-tenant de gestão para barbearias
(`apps/api` NestJS + `apps/web` Next 14, monorepo pnpm/Turborepo).

Alvo: o wizard `/app/configurar` (6 passos), nascido na fase 03 e nunca
auditado desde então. O dono do produto o percorreu no navegador em
2026-09-03 e trouxe quatro problemas concretos, mais uma regra de produto que
muda o contrato da tela:

> **Concluir a configuração inicial é obrigatório para acessar o painel.**
> Não existe "explorar antes", não existe "continuar depois". O dono entra no
> wizard depois do cadastro e só sai dele pela última etapa.

Tudo nesta fase decorre dessa regra.

---

## Leia primeiro

`CONTEXT.md` tem ~5.900 linhas. **Não leia inteiro.** Faixas, na ordem:

```bash
sed -n '1,30p'      CONTEXT.md   # cabeçalho e último estado
sed -n '166,208p'   CONTEXT.md   # tabela de fases
sed -n '247,264p'   CONTEXT.md   # endpoints de /onboarding — o contrato atual
sed -n '565,572p'   CONTEXT.md   # /my-page: publicBaseUrl e a trava de slug reservado
sed -n '3620,3745p' CONTEXT.md   # árvore de apps/web + guardas de sessão (DashboardGuard)
sed -n '4530,4548p' CONTEXT.md   # decisões da fase 03 sobre o wizard (ViaCEP, progresso, "Pular etapa")
sed -n '4919,4935p' CONTEXT.md   # duas dívidas da fase 11 que ESTA fase fecha
sed -n '5480,5486p' CONTEXT.md   # estado do upload de imagem (StorageAdapter)
```

Depois, `SPEC.md` → **RBAC** e **Design system**.

Código que você vai tocar — leia antes de escrever:

```
apps/web/app/(dashboard)/app/configurar/
apps/web/components/dashboard/onboarding/onboarding-wizard.tsx
apps/web/components/dashboard/my-page/image-slot.tsx        ← reusar, não copiar
packages/ui/src/auth/  (DashboardGuard e o provider de sessão)
apps/api/src/onboarding/  (service, controller, DTOs)
apps/api/src/my-page/     (o upload que já existe: POST /my-page/images/:slot)
packages/types/src/onboarding.ts
```

**Se o agente 29 já rodou**, confira no `CONTEXT.md` se ele fechou as duas
dívidas da fase 11 abaixo (link `/agendar/` e upload do passo 3). Se fechou,
não refaça — só confira que o resultado atende ao que esta fase pede. Se não
rodou, elas são suas.

---

## Regras invioláveis

1. **Fidelidade ao design system.** Dark `#0F1115`, dourado `#D4A84C`,
   Sora/Inter, inputs de 48px, botões de 52px. Nada de valor solto.
2. **Todo botão tem função real.** Esta fase REMOVE dois botões exatamente
   porque violam isso.
3. **Permissão e tenant no servidor.** A obrigatoriedade do wizard tem de ser
   verdade na API, não só no guard do cliente.
4. **Sem `disabled` para regra de negócio.** Dois ramos de render.
5. **Reuso estrito.** `ImageSlot`, `StorageAdapter`, `SlugService`, o proxy de
   CEP, o `OnboardingState` — tudo já existe. Componente ou rota nova exige
   justificativa escrita no `CONTEXT.md`.
6. **Suíte verde e acima da linha de base** registrada no `CONTEXT.md`.

---

## Escopo

### Entra

Os cinco blocos abaixo, nesta ordem.

### NÃO entra

- Passos 1, 4, 5 e 6 do wizard, além do que a regra de obrigatoriedade exige
  deles (bloco A). Não redesenhe o que ninguém reclamou.
- Trocar o `LocalStorageDriver` por S3/R2 — é decisão de deploy, fora.
- Redimensionar/otimizar imagem no servidor — dívida conhecida, fica.
- Qualquer coisa da fase 12.

---

## Bloco A — Obrigatoriedade: verificar, e fazer valer nos dois lados

**Hoje o `DashboardGuard` manda onboarding pendente para `/app/configurar`** —
isso está registrado na fase 11 e foi o que fez a varredura responsiva medir o
wizard achando que media o `/app`. Mas "existe um redirect" não é "é
obrigatório". Verifique e feche cada furo:

1. **Cliente.** Com onboarding pendente, TODA rota de `(dashboard)/app/*` cai
   no wizard — não só `/app`. Teste digitando `/app/agenda`, `/app/clientes`,
   `/app/configuracoes` direto na barra. As únicas rotas que o guard deixa
   passar com onboarding pendente são as que não pertencem ao painel:
   `/app/configurar`, `/app/selecionar-barbearia`, `/app/aceitar-convite`,
   `/app/impersonar`. Se alguma outra escapa, feche.
2. **Servidor.** `POST /onboarding/complete` só pode marcar `onboardingDoneAt`
   se os passos **obrigatórios** estiverem gravados: 1 (perfil), 2 (endereço),
   4 (ao menos um serviço) e 6 (horário). Os passos 3 (identidade) e 5 (equipe)
   são puláveis por decisão da fase 03 e continuam sendo. Sem isso, chamar a
   rota direto pula o wizard inteiro. Responda 409 com código de erro do
   contrato (`ONBOARDING_INCOMPLETE`, listando os passos faltantes) e cubra com
   e2e.
3. **`BARBER` num tenant com onboarding pendente.** O wizard é
   `@Roles('OWNER','MANAGER')`. Um barbeiro convidado antes de o dono terminar
   não pode receber o wizard (não consegue completá-lo) nem o painel (a regra
   proíbe). Descubra o que acontece hoje e entregue uma tela de espera honesta:
   "A barbearia ainda está sendo configurada pelo responsável", com "Sair".
4. **Teste de guard.** Um caso para "onboarding pendente + rota do painel →
   wizard" e um para "onboarding concluído + `/app/configurar` → painel" (o
   wizard não deve reabrir depois de concluído; hoje confira se reabre).

---

## Bloco B — Passo 0: remover "Pular e explorar o painel"

Tela de boas-vindas (`Bem-vindo ao BarberVP, {nome}`). O link **"Pular e
explorar o painel"** navega para `/app`, que o guard devolve para
`/app/configurar` — o botão gira em falso. E mesmo que funcionasse, não deveria
existir: contradiz a regra.

Remova o link e qualquer handler/estado que só ele usava. A tela fica com o
título, o subtítulo, os três cards de garantia e **"Começar configuração →"**.
Enquanto estiver ali, corrija o subtítulo: "Você pode pausar a qualquer
momento" deixou de ser verdade — o progresso continua gravado no banco por
passo (decisão da fase 03), então diga isso: *"Se fechar o navegador, você
retoma de onde parou."*

Reveja também o **nome no título**: mostra `rafael`, em minúscula, como veio
do e-mail. Use o nome do usuário como ele digitou no cadastro; se o cadastro
não tiver nome próprio, use "Bem-vindo ao BarberVP" sem vocativo. Nunca um
fragmento de e-mail.

---

## Bloco C — Passos 1 a 6: remover o "×" do cabeçalho

No topo direito de todo passo há um botão **"×"** (continuar depois). Pela
regra, ele não existe. Remova o botão, o handler e a rota de saída que ele
usava. **Não** substitua por outro atalho. O cabeçalho fica com o logo, o
título "Configurar barbearia · N de 6" e a barra de progresso.

Confira que remover o "×" não deixa o wizard sem saída para quem já concluiu:
esse caso é o Bloco A, item 4.

---

## Bloco D — Passo 2 ("Onde fica sua barbearia"): Cidade e UF viram seletores com busca

Hoje **Cidade** e **UF** são inputs de texto livre preenchidos pela ViaCEP. Passam
a ser dois seletores pesquisáveis, com a UF governando a Cidade.

**Dados.** Não hardcode os 5.570 municípios no bundle. Siga o padrão que a fase
03 fixou para a ViaCEP — *consultado pela API, cache no Redis, degrada com
graça*:

- `GET /onboarding/ufs` — as 27 UFs, lista estática em `packages/types`
  (sigla + nome), sem chamada externa.
- `GET /onboarding/cities/:uf` — proxy da API de localidades do IBGE
  (`/localidades/estados/{UF}/municipios`), cache no Redis por 30 dias, mesmo
  throttle do CEP. Devolva `{ id, name }` — o `id` é o código IBGE, que a
  ViaCEP também devolve no campo `ibge`.

Se o IBGE cair, o seletor de cidade degrada para input de texto livre com
aviso discreto — nunca trava o passo.

**Comportamento.**

- UF: combobox com busca por sigla ou nome ("SP", "são paulo"). 27 itens,
  sem paginação.
- Cidade: combobox com busca, habilitada só depois da UF (dois ramos de
  render, não `disabled`), lista filtrada pela UF. Busca sem acento e sem
  caixa ("ribeirao" acha "Ribeirão Preto").
- **Buscar CEP** continua funcionando e passa a **selecionar** UF e Cidade nos
  combos, casando pelo código IBGE (não pelo nome — "Ribeirão Preto" com e sem
  acento é o mesmo município). O selo "Endereço encontrado" e o texto
  "Preenchido pelo CEP" continuam como estão.
- Trocar a UF depois de escolher a cidade limpa a cidade.
- Teclado: setas, Enter, Esc; foco visível; item ativo anunciado (o design
  system já cobra isso dos overlays).
- Alvos de toque ≥ 44px; nos 5 tamanhos da varredura sem rolagem horizontal.

**Componente.** Procure em `packages/ui` um `Combobox`/`Select` pesquisável. Se
existir, use. Se não existir, crie **um** primitive `Combobox` em `packages/ui`
(portal, bloqueio de scroll, mesmas convenções dos overlays da fase 02) — e
registre no `CONTEXT.md` que ele nasceu aqui, porque a aba Configurações e a
Minha Página (que também têm endereço) vão querer o mesmo.

**Contrato.** `PUT /onboarding/location` passa a receber `cityIbgeCode` além
de `city`/`state`, e grava os três. A linha única renderizada
(`addressLine`) não muda. Migration só se `TenantSettings` não tiver onde
guardar o código.

---

## Bloco E — Passo 3 ("Identidade & link público"): upload de verdade e a forma mais amigável possível

O passo hoje é três inputs de texto, dois deles pedindo **URL de imagem** com
o aviso "O upload direto chega na fase de integrações". **Esse aviso mente
desde o agente 25**: o `StorageAdapter` existe, `POST /my-page/images/:slot`
recebe multipart (JPG/PNG/WebP até 5 MB) e grava na **mesma** `TenantSettings`
que este passo escreve. Falta só o consumidor.

**Fotos.** Substitua os dois inputs de URL pelo `ImageSlot` de
`components/dashboard/my-page/image-slot.tsx` — reusado, não copiado. O slot
de logo é quadrado; o de capa é largo. Cada um com:

- Área de soltar arquivo ("Arraste ou clique para escolher"), prévia imediata,
  botão de trocar e de remover;
- Restrições escritas onde o dono vê antes de tentar: formato, 5 MB, e o
  tamanho mínimo que a página pública precisa (logo 400×400; capa, o que o
  `/{slug}` renderiza — leia `components/booking/` para saber);
- Erro do servidor (tamanho, formato) exibido no próprio slot, não em toast.

Upload vai por `POST /my-page/images/:slot` — não crie rota nova. Se a rota
exigir algo que o tenant em onboarding ainda não tem (confira o service),
ajuste o service, não duplique a rota. `onboarding.service.ts` para de aceitar
`logoUrl`/`coverUrl` por URL digitada; `PUT /onboarding/identity` passa a
receber só o slug.

**Prévia.** Abaixo dos slots, mostre um card compacto de **como a barbearia vai
aparecer** na página pública: capa, logo sobreposto, nome do passo 1, endereço
do passo 2. Consuma o `OnboardingState` que a API já devolve — não monte um
segundo renderizador. É o que transforma "capriche" em algo que o dono consegue
julgar.

**Link público.**

- **Corrija o prefixo.** A tela mostra `http://localhost:3000/agendar/` e a
  página da barbearia é `{base}/{slug}` — o link do fim do wizard leva a 404.
  É a dívida da fase 11: `onboarding.service.ts:443` interpola `/agendar/`, e
  `onboarding-wizard.tsx:195` faz o inverso. Use o mesmo `publicBaseUrl` que
  `GET /my-page` já devolve, para os dois lugares mostrarem a mesma coisa.
- **Sugira o slug** a partir do nome da barbearia do passo 1 (a fase 03 já tem
  `GET /onboarding/slug?slug=` com sugestão — use-a), preenchendo o campo na
  primeira visita ao passo. O dono edita se quiser.
- Verificação de disponibilidade com debounce (~500 ms) e três estados
  visíveis: verificando / disponível / indisponível com a sugestão da API em
  um clique.
- A trava de slug reservado (`SlugService`) já existe — confira que o wizard a
  respeita e mostra a mensagem certa ("Este nome é reservado pelo sistema"),
  não um erro genérico.
- Mostre o link completo, clicável para copiar, abaixo do campo — é o que o
  dono vai mandar para os clientes.

**Texto.** Título e subtítulo continuam. Remova a frase sobre "fase de
integrações". Toda instrução é escrita para quem nunca subiu uma imagem num
site: sem "URL", sem "px" solto sem contexto.

**"Pular etapa"** continua existindo — o passo é pulável por decisão da fase
03 — mas deixe claro o custo: "Você pode adicionar logo e capa depois em Minha
Página".

---

## Critérios de aceite

- `pnpm turbo run lint typecheck` 11/11 · `pnpm turbo run build` 3/3
  (`NODE_ENV=production`).
- Suítes verdes, **acima** da linha de base do `CONTEXT.md`. Novos casos, no
  mínimo: `complete` recusa com passo obrigatório faltando; `cities/:uf` serve
  do cache na segunda chamada; upload no passo 3 grava `logoUrl` da mesma
  forma que a Minha Página; guard cobre rota do painel com onboarding
  pendente. Rota nova tem caso de isolamento.
- `make responsive --delay=6000` verde em `/app/configurar` nos 6 passos —
  **medindo cada passo**, não só o primeiro (a lição do #9 da fase 13: verde
  da varredura não prova que a tela certa foi medida).
- **No navegador, do zero:** `make reset && make seed` → cadastro novo →
  wizard sem "×" e sem "Pular e explorar" → CEP preenche os combos → upload
  de logo e capa com prévia → slug sugerido e link com o prefixo certo → fim →
  painel. Depois: `/app/configurar` não reabre; `/app/agenda` durante o wizard
  volta ao wizard; `POST /onboarding/complete` direto, com passo faltando,
  dá 409.
- Nenhum input de URL de imagem restante em `apps/web`. (`grep -rn "URL do logo\|URL da foto" apps/web` devolve vazio.)

---

## Ao finalizar

Atualizar `CONTEXT.md`:

- **Cabeçalho** — novo "Atualizado por último", no tom dos anteriores: a regra
  de produto primeiro (concluir é obrigatório), depois os dois botões que a
  contradiziam e o aviso que mentia sobre upload, depois os números da suíte.
- **Tabela de fases** — linha 30 ✅.
- **Endpoints** — seção `/onboarding` atualizada: `ufs`, `cities/:uf`, o novo
  corpo de `location`, `identity` só com slug, e a validação de `complete`.
- **Bloco "O que o agente 30 entregou"** — por bloco A–E, com as decisões
  (fonte das cidades, o que acontece com o `BARBER`, o `Combobox` se nasceu).
- **Dívidas técnicas** — riscar, **onde aparecem**: a dívida do link
  `/agendar/` (fase 11), a de upload do passo 3 (fases 03 e 25) e o item
  correspondente na tabela "Fechamento do produto v1 → Upload de imagem".
  Acrescentar as novas (a foto do BARBEIRO na aba Equipe continua por URL —
  é do agente 29, Camada 5).
- **Decisões tomadas** — datar: obrigatoriedade do wizard; cidades via IBGE
  com cache, pelo mesmo motivo da ViaCEP.
- **Números finais** — recontar rodando, não estimar.
