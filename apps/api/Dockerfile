# Imagem de produção da API. Contexto de build = raiz do monorepo.
#   docker build -f apps/api/Dockerfile -t barbervp/api .

# ── base ─────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
# `openssl` é exigido pelo engine do Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm

# ── deps ─────────────────────────────────────────────────────────────────────
# Camada separada: só reinstala quando um manifesto muda.
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm --filter @barbervp/types build \
  && pnpm --filter @barbervp/api exec prisma generate \
  && pnpm --filter @barbervp/api build

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

# Processo sem privilégio de root.
RUN groupadd --system --gid 1001 barbervp \
  && useradd --system --uid 1001 --gid barbervp barbervp

COPY --from=build --chown=barbervp:barbervp /app/node_modules ./node_modules
COPY --from=build --chown=barbervp:barbervp /app/packages ./packages
COPY --from=build --chown=barbervp:barbervp /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=barbervp:barbervp /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=barbervp:barbervp /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=barbervp:barbervp /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=barbervp:barbervp /app/package.json /app/pnpm-workspace.yaml ./

USER barbervp
WORKDIR /app/apps/api
EXPOSE 3333

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3333/api/v1/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Migrations rodam antes do processo aceitar tráfego.
CMD ["sh", "-c", "node ../../node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
