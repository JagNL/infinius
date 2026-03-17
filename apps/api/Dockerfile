# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

WORKDIR /app

# Copy workspace manifests for dependency resolution
COPY package.json pnpm-workspace.yaml* pnpm-lock.yaml* ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy all package manifests first (layer caching)
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-core/package.json ./packages/agent-core/
COPY packages/memory/package.json ./packages/memory/
COPY packages/tools/package.json ./packages/tools/
COPY packages/orchestrator/package.json ./packages/orchestrator/
COPY packages/scheduler/package.json ./packages/scheduler/
COPY packages/connectors/package.json ./packages/connectors/
COPY packages/skills/package.json ./packages/skills/
COPY packages/documents/package.json ./packages/documents/
COPY packages/media/package.json ./packages/media/
COPY apps/api/package.json ./apps/api/

# Install all deps (including devDeps for build)
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Build all packages + API in dependency order
RUN pnpm --filter @infinius/shared build
RUN pnpm --filter @infinius/memory build
RUN pnpm --filter @infinius/agent-core build
RUN pnpm --filter @infinius/tools build
RUN pnpm --filter @infinius/orchestrator build
RUN pnpm --filter @infinius/scheduler build
RUN pnpm --filter @infinius/connectors build
RUN pnpm --filter @infinius/skills build
RUN pnpm --filter @infinius/documents build
RUN pnpm --filter @infinius/media build
RUN pnpm --filter @infinius/api build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install Chromium for browser automation + PDF generation
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont

ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

WORKDIR /app

# Copy workspace manifests so pnpm install knows the workspace shape
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml* ./
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/tsconfig.base.json ./

# Copy all package.json files (needed for workspace install)
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/agent-core/package.json ./packages/agent-core/
COPY --from=builder /app/packages/memory/package.json ./packages/memory/
COPY --from=builder /app/packages/tools/package.json ./packages/tools/
COPY --from=builder /app/packages/orchestrator/package.json ./packages/orchestrator/
COPY --from=builder /app/packages/scheduler/package.json ./packages/scheduler/
COPY --from=builder /app/packages/connectors/package.json ./packages/connectors/
COPY --from=builder /app/packages/skills/package.json ./packages/skills/
COPY --from=builder /app/packages/documents/package.json ./packages/documents/
COPY --from=builder /app/packages/media/package.json ./packages/media/
COPY --from=builder /app/apps/api/package.json ./apps/api/

# Install production deps only (resolves symlinks correctly in this stage)
RUN pnpm install --prod --no-frozen-lockfile

# Copy compiled package dist folders
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/agent-core/dist ./packages/agent-core/dist
COPY --from=builder /app/packages/memory/dist ./packages/memory/dist
COPY --from=builder /app/packages/tools/dist ./packages/tools/dist
COPY --from=builder /app/packages/orchestrator/dist ./packages/orchestrator/dist
COPY --from=builder /app/packages/scheduler/dist ./packages/scheduler/dist
COPY --from=builder /app/packages/connectors/dist ./packages/connectors/dist
COPY --from=builder /app/packages/skills/dist ./packages/skills/dist
COPY --from=builder /app/packages/documents/dist ./packages/documents/dist
COPY --from=builder /app/packages/media/dist ./packages/media/dist

# Copy compiled API
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Workspace files directory
RUN mkdir -p /tmp/infinius-workspaces

# Railway injects PORT env var at runtime — we expose that port.
# The CMD reads process.env.PORT so the server always listens on Railway's assigned port.
EXPOSE 8080

CMD ["node", "apps/api/dist/index.js"]
