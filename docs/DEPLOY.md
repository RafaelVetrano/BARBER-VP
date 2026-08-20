# Deploy do BarberVP

Guia de produção. Para desenvolvimento, `README.md` + `make help`.

## O que sobe

| Processo | Imagem | Papel |
|---|---|---|
| `api` | `apps/api/Dockerfile` | REST `/api/v1` — web |
| `worker` | a MESMA imagem da `api` | consome as filas BullMQ |
| `web` | `apps/web/Dockerfile` | Next.js standalone — as 4 superfícies (fase 11) |
| `db` | `postgres:16` | precisa da extensão `btree_gist` |
| `redis` | `redis:7` | filas, rate limit e cache |

`worker` e `api` são a mesma imagem com env diferente — ver "Separando web de
worker".

## Antes do primeiro deploy

1. **Gere segredos de verdade.** `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET`
   têm mínimo de 32 caracteres e o boot recusa qualquer coisa menor:

   ```bash
   openssl rand -base64 48   # uma vez para cada
   ```

2. **Confira o `.env` contra `.env.example`.** O boot valida o ambiente por
   Zod (`apps/api/src/config/env.schema.ts`) e o processo NÃO sobe com
   configuração inválida — falhar aqui é barato, falhar em produção não é.

3. **Ajuste o que muda em produção:**

   | Variável | Produção |
   |---|---|
   | `NODE_ENV` | `production` — liga HSTS, CSP e o cookie `Secure` |
   | `AUTH_COOKIE_DOMAIN` | `.seudominio.com.br`, para o refresh valer nos 4 subdomínios |
   | `CORS_ORIGIN_*` | as quatro origens reais; sem wildcard |
   | `PUBLIC_BOOKING_BASE_URL` | domínio público do booking |
   | `HOST_SITE` · `HOST_BOOKING` · `HOST_APP` · `HOST_ADMIN` | os quatro hosts do `apps/web`; sem eles o roteamento por host e a guarda do super admin ficam desligados |
   | `NEXT_PUBLIC_SITE_URL` · `_BOOKING_URL` · `_DASHBOARD_URL` · `_ADMIN_URL` | origem de cada superfície, para os links entre elas e o canonical do SEO |
   | `THROTTLE_STORAGE` | `redis` (padrão) — obrigatório com mais de uma réplica |
   | `QUEUE_WORKERS_ENABLED` | `false` na api, `true` no worker |

4. **Banco**: `btree_gist` é criada pela primeira migration. O usuário do
   Postgres precisa de permissão para `CREATE EXTENSION`.

## Subindo

```bash
make prod-build                                   # imagens multi-stage
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api \
  pnpm --filter @barbervp/api exec prisma migrate deploy
```

O `seed` é opcional em produção: ele cria a barbearia de demonstração e as
contas de desenvolvimento. **Não rode em produção** a menos que queira os dados
de exemplo.

## Separando web de worker

As filas BullMQ (`apps/api/src/queue/`) são registradas no boot, mas quem as
CONSOME depende de `QUEUE_WORKERS_ENABLED`:

- **api** (`QUEUE_WORKERS_ENABLED=false`): serve HTTP, enfileira e o painel de
  jobs continua lendo a fila. Escale à vontade.
- **worker** (`QUEUE_WORKERS_ENABLED=true`): consome. **Uma réplica basta** —
  os jobs são agendamentos repetíveis, e mais réplicas só dividiriam o mesmo
  trabalho.

Com `true` nas duas, nada quebra (o dreno do outbox reivindica cada linha antes
de entregar, então não há envio duplicado), mas é desperdício.

Os quatro agendamentos e seus horários estão em `.env.example`
(`QUEUE_*_HOUR`), escalonados para não competirem pelo banco.

## Verificando

```bash
curl https://api.seudominio.com.br/api/v1/health
```

200 com `database` e `redis` em `up`. 503 se qualquer um estiver fora — é o que
o balanceador deve usar como health check.

O painel de filas (`/admin/filas`) mostra o próximo disparo de cada job e o
resultado dos últimos. `/mensagens` mostra o que os adapters geraram.

## Rate limit e réplicas

`THROTTLE_STORAGE=redis` é o padrão e o único correto com N réplicas: em
memória, cada uma conta o seu, e o teto real de um ataque de força bruta vira
N × o limite configurado. `memory` só serve para instância única sem Redis.

## Backup

O que precisa de backup é o **Postgres**. O Redis guarda filas, contagem de
rate limit e o estado do gateway de pagamento mock — tudo reconstruível, exceto
as cobranças simuladas (irrelevante fora de desenvolvimento).

## Armadilhas conhecidas

- **`pnpm build` falhando com `EACCES ... mkdir dist/...`**: cache incremental
  do TypeScript dessincronizado do `dist`. `pnpm --filter @barbervp/api clean`
  e refaça.
- **Migrations são escritas à mão.** O auto-diff do Prisma não sobrevive à
  coluna gerada `Appointment.timeRange`; use `make migrate-create` apenas para
  gerar o esqueleto e revise o SQL.
