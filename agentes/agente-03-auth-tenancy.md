# Agente 03 — Auth & Tenancy

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade, segurança e responsividade de produto profissional.

## Leia primeiro

1. `agentes/CONTEXT.md` — confirmar fases 01 e 02 ✅
2. `agentes/SPEC.md` — Papéis e permissões, Modelo de dados (User/Membership/
   Client), Regras invioláveis
3. `.dc.html` desta fase: `BarberVP Login Estabelecimento.dc.html`,
   `BarberVP Cadastro Estabelecimento.dc.html`,
   `BarberVP Configurar Barbearia.dc.html`, `ClienteAuth.dc.html`

## Regras invioláveis (valem nesta sessão)

1. Responsividade obrigatória — em especial o onboarding (wizard de 6
   passos) e os formulários de auth do cliente (sheets mobile-first).
2. Zero dado mockado — os `MOCK_USERS`/`ESTABLISHMENTS`/`CLIENTS` dos
   `.dc.html` viram validação real contra o banco, nunca array no cliente.
3. Isolamento de tenant é sagrado — todo endpoint autenticado de
   estabelecimento resolve o tenant do JWT ou do slug e nunca aceita
   `tenantId` vindo do body/query.
4. Regras de negócio estruturais: registro cria `User`+`Tenant`+`Membership`
   em uma única transação; slug único.
5. Integrações: e-mail (recuperação de senha) e OTP (SMS/WhatsApp) atrás de
   `MailAdapter`/`NotificationAdapter` mock desta fase.
6. Segurança de produção: JWT access 15min + refresh httpOnly rotativo,
   argon2, OTP com expiração e rate limit agressivo, RBAC completo,
   auditoria em login/troca de senha/criação de tenant.

## Sua tarefa nesta sessão

Escopo: toda autenticação (estabelecimento e cliente) + onboarding do
tenant. NÃO entra: telas de negócio (booking, dashboard) além do
onboarding em si.

### Tarefas backend

- **Registro de estabelecimento**: cria `User` + `Tenant` (status `TRIAL`) +
  `Membership` `OWNER` em transação única. Slug único gerado a partir do
  nome da barbearia, validado/normalizado (o protótipo já sugere
  `barberos.app/agendar/{slug}` — reproduzir a mesma validação de slug:
  lowercase, `[a-z0-9-]`).
- **Vínculo de conta existente**: o protótipo de Cadastro Estabelecimento
  detecta se o e-mail já existe como conta de `Client` e oferece "vincular"
  a mesma conta ao criar o tenant (confirma senha atual) — implementar como
  fluxo real: mesmo `User`/`Client` pode ganhar um `Membership` novo sem
  duplicar cadastro. Também detecta e-mail já usado por outro
  estabelecimento (erro "já existe um cadastro com este e-mail").
- **Login estabelecimento**: JWT access 15min + refresh httpOnly com
  rotação e revogação (tabela de sessões); logout; troca de senha;
  recuperação via `MailOutbox` mock.
- **Auth cliente** (extraído de `ClienteAuth.dc.html`, é o fluxo mais
  completo do bundle):
  - Login por telefone OU e-mail + senha.
  - Registro: nome, sobrenome, telefone (WhatsApp, único), e-mail +
    confirmação, senha (mínimo 8, letra + número) + confirmação, aceite de
    termos, opt-in de promoções — todos validados igual ao protótipo.
  - Verificação por OTP de 6 dígitos após registro, com reenvio (cooldown
    59s) e opção "receber por chamada" (pode ficar como stub no
    `NotificationAdapter`).
  - Recuperação de senha reusa o mesmo fluxo de OTP (telefone ou e-mail →
    código → nova senha).
  - Sessão do cliente separada da de estabelecimento (`audience` distinto
    no JWT).
  - Botão "Continuar com Google" existe no protótipo como placeholder
    ("Em breve") — deixar a interface pronta mas não implementar OAuth
    nesta fase (fora de escopo, adapter futuro).
- **RBAC completo**: guards `@Roles()` funcionais (`OWNER`, `MANAGER`,
  `BARBER`, `CLIENT`, `SUPER_ADMIN` reservado para fase 08); `TenantGuard`
  resolve tenant do token; um `User` pode ter `Membership` em N tenants →
  endpoint de seletor de contexto (o protótipo de vínculo de conta já
  antecipa esse caso).
- **Onboarding** (`Configurar Barbearia`, wizard de 6 passos real):
  1. Dados da barbearia (nome, telefone, Instagram, descrição até 200
     caracteres).
  2. Localização (CEP com autopreenchimento via ViaCEP, endereço editável).
  3. Identidade & link público (logo, capa, slug personalizado).
  4. Serviços iniciais (nome, duração, preço — pré-populados com sugestões,
     editáveis).
  5. Equipe (dono entra automaticamente como profissional; adicionar mais
     barbeiros com nome + WhatsApp — texto do protótipo já informa que a
     quantidade de profissionais define a faixa de plano: Essencial até 2,
     Profissional até 4, Avançado ilimitado, mas "durante o trial tudo é
     permitido").
  6. Horário de funcionamento por dia da semana, com atalho "aplicar estes
     horários para todos os dias abertos".
  - Endpoints: `TenantSettings`, `Service` em lote, `Barber` em lote,
    `WorkSchedule` em lote — tudo dentro do tenant recém-criado.
- **AuditLog** em: login, troca de senha, criação de tenant, alterações de
  `TenantSettings`.
- **Casos de isolamento** (adicionar à suíte da fase 01): token do tenant A
  usado em rota do tenant B → 403; membership de um tenant não vaza
  permissão em outro.

### Tarefas frontend

- `apps/site`: telas de Login e Cadastro Estabelecimento pixel-faithful e
  responsivas (o protótipo usa layout 45%/55% split desktop com imagem à
  esquerda — colapsar para coluna única < 860px, conforme o próprio CSS do
  protótipo já indica). Fluxo pós-cadastro redireciona ao onboarding no
  dashboard.
- `apps/dashboard`: wizard "Configurar Barbearia" com os 6 passos reais
  acima, barra de progresso, navegação voltar/pular etapa (pular disponível
  nos passos 3 e 5, conforme protótipo), tela de conclusão com link
  copiável e atalhos para dashboard/agenda.
- `apps/booking`: `ClienteAuth` como sheet/modal reutilizável (login,
  registro, OTP, recuperação, sucesso) — é importado de dentro do wizard de
  agendamento e da página pública, então construir como componente
  isolado e reaproveitável, não como página própria.
- Middleware/guards de rota nas 4 apps; refresh automático no interceptor
  do axios.

## Critérios de aceite

- Fluxo completo cadastro → onboarding → dashboard funcionando contra a
  API real, sem dado mockado no frontend.
- Fluxo completo de cliente: registro → OTP → conta criada; login;
  recuperação de senha — todos batendo com a API.
- Isolamento testado: token de um tenant não acessa dados de outro (403).
- Checklist de responsividade (`SPEC.md`/skill) aplicado ao onboarding e ao
  `ClienteAuth`.

## Ao finalizar

Atualizar `agentes/CONTEXT.md`: fase 03 ✅, endpoints de auth/onboarding
criados, decisões (ex.: como ficou o fluxo de vínculo de conta cliente↔dono,
formato final do audience no JWT), dívidas técnicas (ex.: Google OAuth
adiado).
