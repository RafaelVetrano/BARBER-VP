# Agente 32 — Regras do cadastro do estabelecimento: unicidade de celular, senha forte e campos de confirmação

Projeto: **BarberVP** — SaaS multi-tenant de gestão para barbearias
(`apps/api` NestJS + `apps/web` Next 14, monorepo pnpm/Turborepo).

Alvo: `/cadastro` e o módulo `apps/api/src/auth`. Três mudanças pedidas pelo
dono do produto em 2026-09-04:

1. **Celular, e-mail e nome da barbearia únicos.** Ver Bloco A — um dos três
   já está pronto no código, um é trabalho de verdade e o terceiro foi
   descartado.
2. **Senha mais forte**: mínimo 8 caracteres, com maiúscula, número e
   caractere especial.
3. **Campos de confirmação** de e-mail e de senha.

Este prompt foi escrito **lendo o código no commit `d1aca88`** (merge do PR #4,
`fixes-dashboard`). Os caminhos, linhas e nomes abaixo são reais. Se algo
divergir do que você encontrar, o repositório andou — confie nele e anote a
divergência no `CONTEXT.md`.

---

## O que já existe (não refaça)

Confirmado no código, não no `CONTEXT.md`:

- **`User.email` já é `@unique`** (`apps/api/prisma/schema.prisma`), e
  `EstablishmentAuthService.register` já devolve 409 `EMAIL_IN_USE` quando o
  e-mail pertence a um `User`.
- **`Tenant.name` NÃO é `@unique`**, e assim continua (Bloco A.3).
- **`ErrorCode.PHONE_IN_USE` já existe** em `packages/types/src/errors.ts`.
  Não crie código de erro novo.
- **A régua de senha já é compartilhada de verdade**: `isPasswordValid` e
  `passwordStrength` vivem em `packages/types/src/auth.ts`; a API consome pelo
  decorator `IsStrongPassword`
  (`apps/api/src/auth/validators/is-strong-password.validator.ts`) e o
  `PasswordInput` de `packages/ui` consome direto.
- **`normalizePhone`/`normalizeMobilePhone`** (mesmo arquivo) já normalizam
  para E.164 sem `+` (`5516999990001`) e já são aplicados no `register`.
- **Já existe padrão de "confirmar senha"** em
  `apps/web/app/(dashboard)/app/aceitar-convite/page.tsx` e em
  `.../meu-perfil/page.tsx` (`password !== confirmPassword`). Reuse a
  convenção; não invente outra.

---

## Leia primeiro

```bash
# Código — é aqui que a verdade mora
sed -n '/^model User /,/^}/p' apps/api/prisma/schema.prisma
sed -n '130,200p' packages/types/src/auth.ts          # as regras compartilhadas
cat apps/api/src/auth/establishment-auth.service.ts   # checkEmail l.102, register l.137, linkClientAccount l.186
cat apps/api/src/auth/dto/establishment-auth.dto.ts
cat apps/web/components/marketing/auth/signup-form.tsx
cat apps/web/components/marketing/auth/link-account-card.tsx
cat packages/ui/src/components/password-input.tsx
cat apps/api/src/auth/shared-rules.spec.ts            # os testes que vão quebrar
```

Do `CONTEXT.md`, só o necessário:

```bash
sed -n '1,30p'      CONTEXT.md
sed -n '166,208p'   CONTEXT.md   # tabela de fases
sed -n '4480,4530p' CONTEXT.md   # decisões da fase 03 sobre auth
```

---

## Regras invioláveis

1. **Validação idêntica nos dois lados**, pela MESMA função de
   `packages/types`. É a regra da fase 03 e o Bloco B depende dela.
2. **A API é a autoridade**; verificação em tempo real é conveniência.
3. **Sem `disabled` para regra de negócio.** Dois ramos de render.
4. **Reuso estrito.** Rota nova exige justificativa no `CONTEXT.md`.
5. **Design system**: inputs `h-12`, botão `size="lg"`, `controlClasses`.
6. **Suíte verde e acima da linha de base** registrada no `CONTEXT.md`.

---

## Bloco A — Unicidade

### A.1 — E-mail: já resolvido, e **não remova o `/auth/check-email`**

`POST /auth/check-email` existe, é `@Public()`, tem `@Throttle` de 20/min e
devolve `EmailCheckResult` com três estados (`available` / `establishment` /
`client`). Ele **sustenta o fluxo de vínculo**: `signup-form.tsx` consulta com
debounce de 450ms e, no estado `client`, troca os campos de nome/celular/senha
pelo `LinkAccountCard` — o "Que bom te ver de novo!". Removê-lo exigiria
redesenhar a tela inteira, e a escolha já está documentada em comentário no
próprio serviço: a rota revela se um e-mail tem conta, a tela depende disso, o
submit revelaria o mesmo, e a mitigação é o rate limit.

**O que fazer:** nada estrutural. Só um ajuste defensável —
**baixe o throttle de `check-email` de 20/min para 5/min por IP**
(`establishment-auth.controller.ts:53`). 20/min são 1.200 consultas por hora
contra as 5/h do `register`, o que torna a rota um varredor confortável de
lista de e-mails vazada. 5/min continua folgado para alguém digitando um
endereço com debounce. Registre a mudança e o número.

### A.2 — Celular: **este é o trabalho de verdade**

`User.phone` é `String?` **sem `@unique`**. Três coisas antes da migration:

**Migration.** `phone String? @unique`. No Postgres vários `NULL` convivem num
índice único, então os barbeiros sem telefone não colidem — mas **cubra isso
com teste**, porque é a premissa que sustenta o campo continuar opcional (quem
entra por convite da Equipe pode não ter telefone, e o `/me` cai para
`Barber.phone` justamente por isso).

**Dados existentes.** O `seed.ts` cria todos os `User` **sem `phone`** (super
admin, owner, manager, barber e o dono do tenant de onboarding) — logo, todos
`NULL`, e a migration passa limpa no seed. Ainda assim, rode a verificação
antes, porque um banco de desenvolvimento pode ter duplicata:

```sql
SELECT phone, count(*) FROM "User" WHERE phone IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
```

Documente no `CONTEXT.md` o que fazer se voltar linha.

**Os quatro caminhos que escrevem `User.phone`** — todos precisam tratar o
conflito, não só o `register`:

| Onde | Arquivo | Hoje |
|---|---|---|
| Cadastro | `establishment-auth.service.ts:157` | `phone: normalizeMobilePhone(dto.phone)` |
| Vínculo cliente→dono | `establishment-auth.service.ts:228` | `phone: client.phone` — **vem do `Client`, o dono não digita** |
| Aceite de convite | `team/invites.service.ts:317` | `phone: invite.phone` |
| Meu perfil | `account/my-profile.service.ts:134` | normalizado, mas **sem checagem de conflito** (o e-mail tem, o telefone não) |

O caso do **vínculo** é o mais delicado: o telefone vem de um `Client` que já
existe, e se outro `User` já tiver aquele número, o vínculo quebra num fluxo
onde o dono não tem campo para corrigir. Decida e registre — sugestão: nesse
caso o `User` nasce com `phone: null` e o dono preenche depois em Meu perfil,
em vez de o cadastro inteiro falhar.

**Normalização já resolvida.** `normalizeMobilePhone` transforma
`(16) 99999-9999` e `+5516999999999` no mesmo `5516999999999`. Confirme que os
quatro caminhos passam por ela antes de gravar — o de convite grava
`invite.phone` direto, verifique a origem.

**Corrida.** `register` faz `findUnique` e depois `create`; dois envios
simultâneos passam pelos dois. O `AllExceptionsFilter`
(`common/filters/all-exceptions.filter.ts:172`) já mapeia `P2002` para 409,
mas com mensagem genérica ("Já existe um registro com esses dados"), que não
diz ao formulário qual campo marcar. Capture o `P2002` dentro do `register` e
mapeie para `EMAIL_IN_USE` ou `PHONE_IN_USE` conforme `error.meta.target`.
Teste.

**Erro:** 409 `PHONE_IN_USE`, "Este celular já está em uso."

### A.3 — Nome da barbearia: **descartado, e isso está decidido**

Avaliado e **descartado pelo dono em 2026-09-04**. Não implemente: sem
constraint, sem checagem, sem mensagem de erro.

Motivo, para registrar no `CONTEXT.md` e ninguém reabrir a discussão daqui a
três meses: `Tenant.slug` já é `@unique` e resolve a colisão que importa (a URL
pública). `Tenant.name` é nome de exibição, e barbearia é ramo de nomes
repetidos por natureza — travar a segunda "Barbearia do Zé" do Brasil
entregaria a ela um erro sem sentido nenhum do ponto de vista dela.

Confirme que `Tenant.name` continua sem `@unique` e que nada em
`provisionTenant` o valida contra outros tenants.

---

## Bloco B — Senha forte

**Regra nova:** ≥8 caracteres, com **maiúscula**, **número** e **caractere
especial**.

**Minúscula NÃO é obrigatória** — decidido pelo dono do produto em 2026-09-04.
São exatamente quatro requisitos: comprimento, maiúscula, dígito, especial.
`SENHA@2026` passa. Não acrescente um quinto teste, e não deixe a lista de
requisitos da tela sugerir que existe um.

### B.1 — Onde a regra mora

Altere **`isPasswordValid` em `packages/types/src/auth.ts:138`**. É o único
lugar. Com isso, ganham a regra de graça: o decorator `IsStrongPassword` (logo,
`RegisterEstablishmentDto`, reset e troca de senha do painel e o lado do
cliente), o `PasswordInput` de `packages/ui`, `aceitar-convite`, `meu-perfil`,
`new-password-screen` e `tab-dados`.

**Exporte também o detalhe**, porque o B.3 precisa dele:

```ts
export interface PasswordChecks {
  length: boolean; upper: boolean; digit: boolean; special: boolean;
}
export function passwordChecks(password: string): PasswordChecks
```

`isPasswordValid` passa a ser a conjunção de `passwordChecks`. O conjunto de
caracteres especiais é **explícito e documentado** no arquivo — sem isso o dono
digita `ç` e não entende a recusa.

### B.2 — O defeito que você vai encontrar

**`signup-form.tsx:29-33` duplica a regra em vez de reusá-la:**

```ts
password: z.string()
  .min(8, 'Mínimo 8 caracteres, com letra e número.')
  .regex(/[A-Za-z]/, ...)
  .regex(/\d/, ...)
```

Viola a regra 1 do kit e é exatamente o que faz o front e a API discordarem.
Troque por `.refine((v) => isPasswordValid(v), ...)`. **Varra o repositório
atrás de outras cópias** antes de encerrar a fase:

```bash
grep -rn "Mínimo 8 caracteres\|min(8" apps/web packages/ui --include=*.tsx --include=*.ts
```

### B.3 — A régua de 4 barras

`passwordStrength` (`auth.ts:146`) hoje pontua por escada própria: 1 = 8
chars; 2 = +letra +número; 3 = +10 chars; 4 = +especial. Com a regra nova,
**qualquer senha aceita já valeria 4** — a régua vira decoração.

Reescreva-a sobre `passwordChecks`: uma barra por requisito atendido — são
quatro requisitos e quatro barras, o que faz a régua e a lista baterem
exatamente. E, sob as
barras, **a lista dos requisitos com ✓/○ ao vivo** (`aria-live="polite"`),
porque "Força da senha: Fraca" não diz **qual** requisito falta. É mudança no
`PasswordInput` de `packages/ui`, atrás da prop `showStrength` que já existe —
nada quebra em quem não a usa.

`STRENGTH_LABEL` continua com 5 posições; ajuste os rótulos à escada nova.

### B.4 — Senhas existentes continuam valendo

A regra vale para senha **nova**. Nenhum caminho de **login** pode aplicar
`isPasswordValid`: quem tem `senha123` continua entrando. Confirme lendo
`login`, `refresh` e o lado do cliente. Não force troca, não exiba aviso.

**Cuidado com o hash compartilhado:** no fluxo de vínculo, `User` e `Client`
guardam o **mesmo `passwordHash`**, e toda troca atualiza os dois
(`client-auth.service.ts:325` e `:580`; `establishment-auth.service.ts:599` e
`:759`). Como a regra é única em `packages/types`, os dois lados ficam
coerentes por construção — mas cubra com teste, porque é a premissa inteira.

### B.5 — Os testes que vão quebrar

`apps/api/src/auth/shared-rules.spec.ts` afirma hoje:

```
isPasswordValid('senha123')      → true    ← passa a ser false
isPasswordValid('minhasenha123') → true    ← passa a ser false
passwordStrength('senha123')     → 2       ← muda
passwordStrength('senha12345!')  → 4       ← muda (não tem maiúscula)
```

**Reescreva-os, não os apague** — são a garantia de que os dois lados
concordam. Acrescente casos para cada requisito isolado.

**Varra a suíte e as seeds** atrás de senhas que deixam de valer:

```bash
grep -rn "senha123\|password: '" apps/api/test apps/api/prisma apps/api/src --include=*.ts
```

Se as seeds usarem senha que a regra nova recusa, **atualize-as e atualize os
roteiros de verificação do `CONTEXT.md`** — senão todo roteiro de login do
arquivo passa a mentir.

---

## Bloco C — Confirmar e-mail e confirmar senha

**Por que confirmar e-mail:** `register` cria a conta ativa e não há
verificação por link — `User.emailVerifiedAt` existe e o `register` **não o
preenche** (só o seed preenche). E-mail errado = conta cuja recuperação de
senha vai para outra pessoa. O campo de confirmação é a única rede hoje.

Em `signup-form.tsx`:

- **"Confirmar e-mail"** logo abaixo de "E-mail". `onPaste` bloqueado — colar
  derrota o propósito. Comparação sobre `trim().toLowerCase()`, a mesma
  normalização que o `normalizeEmail` do DTO aplica. Erro inline no campo.
- **"Confirmar senha"** logo abaixo de "Senha", mesmo `PasswordInput` sem
  `showStrength`, mesma convenção de `aceitar-convite`.
- Ambos **também no DTO** (regra 1): `confirmEmail` e `confirmPassword` em
  `RegisterEstablishmentDto`, validados no servidor mesmo que a API só grave um
  de cada par.
- **Os dois campos entram no ramo `!isClientLink`**, junto com nome, celular e
  senha — no vínculo eles não fazem sentido, a conta já existe.

**Altura.** A coluna vai de 5 para 7 campos e o print já mostra ela quase cheia
em 1080p. Não encolha `h-12` nem o botão `size="lg"`. Se não couber, quebre em
duas etapas (acesso → barbearia) e registre a decisão.

**A ordem final:**

```
Nome completo · Celular · E-mail · Confirmar e-mail ·
Senha (barras + requisitos ✓/○) · Confirmar senha · Nome da barbearia ·
[termos] · [Criar minha conta grátis]
```

Responsivo: 5 tamanhos, sem rolagem horizontal, alvos ≥ 44px.

---

## Critérios de aceite

- `pnpm turbo run lint typecheck` 11/11 · `pnpm turbo run build` 3/3
  (`NODE_ENV=production`).
- Suítes verdes e acima da linha de base. Casos novos, no mínimo:
  - dois `User` com `phone: null` convivem (a premissa do índice);
  - celular repetido em formato diferente → 409 `PHONE_IN_USE`;
  - `P2002` de e-mail vira `EMAIL_IN_USE`, de telefone vira `PHONE_IN_USE`;
  - **e-mail de `Client` continua abrindo o `LinkAccountCard`** — o teste que
    protege o fluxo da fase 03;
  - vínculo com telefone já ocupado não quebra (o comportamento que você
    decidiu em A.2);
  - `senha123` → 400 no register; `senha123` → **login OK** para conta antiga;
  - `SENHA@2026` (sem minúscula) → **aceita**, é o caso que fixa a decisão de
    quatro requisitos;
  - troca de senha do cliente vinculado atualiza os dois hashes sob a regra
    nova;
  - `confirmEmail`/`confirmPassword` divergentes → 400 no servidor;
  - dois tenants com o mesmo nome se cadastram sem erro (protege A.3).
- `make responsive --delay=6000` verde em `/cadastro`.
- **No navegador:** cadastro do zero; repetir e-mail (vê "já existe"); repetir
  celular em outro formato; digitar senha e ver a lista de requisitos
  preenchendo um a um; colar no "Confirmar e-mail" e ver que não cola; e-mail
  de cliente existente ainda abre o card de vínculo.
- `grep -rn "min(8\|Mínimo 8 caracteres" apps/web packages/ui` não devolve
  nenhuma regra duplicada — só a de `packages/types`.

---

## Ao finalizar

Atualizar `CONTEXT.md`:

- **Cabeçalho** — "Atualizado por último": a regra de senha (que invalida
  senhas que a suíte e as seeds usavam), depois a unicidade de celular, depois
  os campos de confirmação; suíte no fim.
- **Tabela de fases** — linha 32 ✅.
- **Endpoints** — `/auth/register` com `confirmEmail`/`confirmPassword` e
  `PHONE_IN_USE`; `/auth/check-email` com o throttle novo.
- **Bloco "O que o agente 32 entregou"** — com as decisões: conjunto de
  caracteres especiais; o que acontece com o telefone no fluxo de vínculo;
  cadastro em uma ou duas etapas; a nova escada de `passwordStrength`.
- **Decisões tomadas** — datar:
  - **nome da barbearia NÃO é único** (avaliado e descartado em 2026-09-04 — o
    `slug` já cobre a colisão que importa);
  - **`/auth/check-email` permanece**, com throttle reduzido — a tela depende
    dele para o fluxo de vínculo e o submit revelaria o mesmo;
  - **minúscula não é requisito de senha** (decidido em 2026-09-04): quatro
    requisitos, não cinco;
  - senhas existentes não são invalidadas no login.
- **Dívidas técnicas** — acrescentar: **o cadastro do painel não verifica o
  e-mail** (`emailVerifiedAt` fica nulo no `register`); "Confirmar e-mail"
  mitiga erro de digitação, não prova posse. Verificação por link é a correção
  real.
- **Números finais** — recontar rodando.
