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

# Install all deps
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Build all packages + API
RUN pnpm --filter @infinius/shared build
RUN pnpm --filter @infinius/agent-core build
RUN pnpm --filter @infinius/memory build
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

# Install Chromium for PDF generation
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

# Copy built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

# Workspace files directory
RUN mkdir -p /tmp/infinius-workspaces

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
