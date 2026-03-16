# Infinius — Deployment Guide

How to run Infinius in production. The recommended stack is Vercel (web) + Railway or Fly.io (API + Redis) + Supabase (database + storage).

---

## Architecture in Production

```
┌─────────────────────────────────────────────────────────────┐
│  Vercel                                                     │
│  apps/web (Next.js)                                         │
│  → served globally via CDN                                  │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTPS / SSE
┌─────────────────────────────▼───────────────────────────────┐
│  Railway / Fly.io                                           │
│  apps/api (Fastify)         apps/api (BullMQ Worker)        │
│  → long-running Node server  → processes background jobs    │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
┌──────────────▼───────────┐   ┌───────────────▼──────────────┐
│  Supabase                │   │  Redis (Upstash or Railway)  │
│  PostgreSQL + pgvector   │   │  BullMQ job queue            │
│  Auth (JWT)              │   │                              │
│  Storage (files)         │   └──────────────────────────────┘
│  Realtime (WebSocket)    │
└──────────────────────────┘
```

---

## Step 1: Supabase Setup

### Create project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your project URL and keys (Settings → API)

### Enable pgvector

```sql
-- Run in Supabase SQL editor
CREATE EXTENSION IF NOT EXISTS vector;
```

### Run migrations

In the Supabase SQL editor, run the contents of:
```
infra/supabase/migrations/001_initial_schema.sql
```

### Configure auth

1. Settings → Authentication → Enable email/password sign-in
2. Add your production domain to the allowed redirect URLs

### Get credentials

You need:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (from Settings → Database → Connection string)

---

## Step 2: Redis Setup

### Option A: Upstash (serverless, recommended)

1. Go to [upstash.com](https://upstash.com) → Create Redis database
2. Choose the region closest to your API deployment
3. Copy the `REDIS_URL` (TLS connection string)

### Option B: Railway

1. Railway → New Project → Deploy Redis
2. Copy the `REDIS_URL` from the Variables tab

---

## Step 3: Deploy the API

### Option A: Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init

# Deploy
railway up --service api
```

Railway will auto-detect the Node.js app. Set environment variables in the Railway dashboard.

**Required env vars for the API**:
```
ANTHROPIC_API_KEY
OPENAI_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
REDIS_URL
API_PORT=3001
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
WORKSPACE_BASE_PATH=/tmp/infinius-workspaces
```

### Option B: Fly.io

Create `apps/api/fly.toml`:

```toml
app = "infinius-api"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = false

[[vm]]
  memory = "1gb"
  cpu_kind = "shared"
  cpus = 1
```

```bash
cd apps/api
fly launch
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy
```

### API Dockerfile

Create `apps/api/Dockerfile`:

```dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @infinius/api... build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
```

---

## Step 4: Deploy the Web App

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from the web app directory
cd apps/web
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://your-api.railway.app
```

Or connect your GitHub repo in the Vercel dashboard:
1. New Project → Import your `infinius` repo
2. Root Directory: `apps/web`
3. Framework: Next.js
4. Add environment variables

**Required env vars for web**:
```
NEXT_PUBLIC_API_URL=https://your-api.railway.app
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

---

## Step 5: Browser Automation (Cloud)

For production browser automation, you need a cloud browser service (the API server doesn't have Chrome installed).

### Option A: Browserless

1. Sign up at [browserless.io](https://browserless.io)
2. Set `BROWSER_WS_ENDPOINT=wss://chrome.browserless.io?token=YOUR_TOKEN`

### Option B: Bright Data (Scraping Browser)

```
BROWSER_WS_ENDPOINT=wss://brd-customer-...@brd.superproxy.io:9222
```

### Option C: Self-hosted Playwright

Add to your API Dockerfile:

```dockerfile
RUN npx playwright install chromium
RUN npx playwright install-deps
```

Then leave `BROWSER_WS_ENDPOINT` unset — Playwright will launch locally.

---

## Step 6: Pipedream Connect (OAuth Connectors)

1. Create a [Pipedream](https://pipedream.com) account
2. Create a new project
3. Enable Connect in the project settings
4. Set these env vars on the API:

```
PIPEDREAM_PROJECT_ID=proj_...
PIPEDREAM_CLIENT_ID=...
PIPEDREAM_CLIENT_SECRET=...
```

Pipedream handles OAuth flows for 400+ services. Without it, connectors show as `DISCONNECTED`.

---

## Step 7: File Storage (Supabase)

For files created by the agent to be downloadable:

1. In Supabase: Storage → New bucket → `workspace-files` → Public
2. Set `STORAGE_PROVIDER=supabase` in env

The agent's `share_file` flow (TODO) will upload to this bucket and return a public URL.

---

## Environment Variables — Complete Reference

### Required (minimum working setup)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key (also used for embeddings) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Public anon key (used in web app) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (used in API only — never expose) |
| `REDIS_URL` | Redis connection string |

### Recommended

| Variable | Description |
|----------|-------------|
| `GOOGLE_AI_API_KEY` | Gemini models |
| `BRAVE_SEARCH_API_KEY` | Web search |
| `TAVILY_API_KEY` | Research-grade search + page extraction |
| `BROWSER_WS_ENDPOINT` | Cloud browser for Playwright |

### Optional connectors

| Variable | Description |
|----------|-------------|
| `PIPEDREAM_PROJECT_ID` | Pipedream Connect project |
| `PIPEDREAM_CLIENT_ID` | Pipedream OAuth client ID |
| `PIPEDREAM_CLIENT_SECRET` | Pipedream OAuth client secret |
| `REPLICATE_API_KEY` | Image + video generation |
| `ELEVENLABS_API_KEY` | Text-to-speech |

---

## Production Checklist

- [ ] pgvector extension enabled in Supabase
- [ ] Database migrations applied
- [ ] All required env vars set on API service
- [ ] `NEXT_PUBLIC_API_URL` points to production API
- [ ] Redis TLS connection string used (not plain `redis://`)
- [ ] `BROWSER_WS_ENDPOINT` set (or Playwright installed on API server)
- [ ] Supabase RLS enabled (it is by default via the migration)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never exposed to the browser (API only)
- [ ] Workspace directory has sufficient disk space (`/tmp` or a mounted volume)
- [ ] BullMQ worker process is running alongside the API
