# Imagem de produção de `apps/booking`. Contexto de build = raiz do monorepo.
#   docker build -f apps/booking/Dockerfile -t barbervp/booking .

# ── base ─────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/site/package.json apps/site/
COPY apps/booking/package.json apps/booking/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
# `NEXT_PUBLIC_*` é embutida no bundle no momento do build.
ARG NEXT_PUBLIC_API_URL=http://localhost:3333/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY packages/ packages/
COPY apps/booking/ apps/booking/
RUN pnpm --filter @barbervp/types build \
  && pnpm --filter @barbervp/booking build

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# `output: 'standalone'` já traz o subconjunto de node_modules necessário.
COPY --from=build --chown=nextjs:nodejs /app/apps/booking/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/booking/.next/static ./apps/booking/.next/static

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/booking/server.js"]
