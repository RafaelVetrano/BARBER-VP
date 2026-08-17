SHELL := /bin/bash
COMPOSE := docker compose
# O WORKDIR do container é a raiz do monorepo, então os comandos do Prisma
# precisam do filtro do workspace da API.
API := $(COMPOSE) exec -T api pnpm --filter @barbervp/api exec

.DEFAULT_GOAL := help
.PHONY: help env install up down logs ps migrate migrate-create seed reset test test-isolation lint typecheck build prod-build sh psql redis-cli

help: ## Lista os alvos disponíveis
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

env: ## Cria .env a partir de .env.example (não sobrescreve)
	@[ -f .env ] || cp .env.example .env && echo "✓ .env pronto"

install: ## Instala dependências do monorepo
	pnpm install

up: env ## Sobe db, redis, api e as 4 webs
	$(COMPOSE) up -d --build
	@echo "✓ stack no ar — api :3333 · site :3000 · booking :3001 · dashboard :3002 · admin :3003"

down: ## Derruba a stack (mantém volumes)
	$(COMPOSE) down

logs: ## Segue os logs de todos os serviços
	$(COMPOSE) logs -f --tail=100

ps: ## Status dos serviços
	$(COMPOSE) ps

migrate: ## Aplica as migrations no banco do compose
	$(API) prisma migrate deploy

migrate-create: ## Cria uma migration nova (make migrate-create name=xxx)
	$(API) prisma migrate dev --name $(name)

seed: ## Popula o banco com os dados do SPEC (2 tenants)
	$(API) prisma db seed

reset: ## Derruba tudo COM volumes, sobe, migra e semeia do zero
	$(COMPOSE) down -v
	$(MAKE) up
	@echo "aguardando api ficar saudável..."
	@until [ "$$($(COMPOSE) ps -q api | xargs docker inspect -f '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ]; do sleep 2; done
	$(MAKE) migrate
	$(MAKE) seed

test: ## Roda a suíte completa (unit + e2e)
	pnpm turbo run test

test-isolation: ## Roda apenas a suíte de isolamento de tenant
	pnpm --filter @barbervp/api test:isolation

lint: ## Lint em todo o monorepo
	pnpm turbo run lint

typecheck: ## Typecheck em todo o monorepo
	pnpm turbo run typecheck

build: ## Build de todos os pacotes/apps
	pnpm turbo run build

prod-build: ## Build das imagens de produção
	$(COMPOSE) -f docker-compose.prod.yml build

sh: ## Shell dentro do container da api
	$(COMPOSE) exec api sh

psql: ## psql no banco do compose
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-barbervp} -d $${POSTGRES_DB:-barbervp}

redis-cli: ## redis-cli no redis do compose
	$(COMPOSE) exec redis redis-cli
