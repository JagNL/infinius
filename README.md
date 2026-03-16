# Infinius

A 1:1 inspired open-source autonomous AI agent platform, architected to mirror [Perplexity Computer](https://perplexity.ai/computer).

> **Goal**: Reproduce every major architectural layer — multi-model agent loop, semantic memory, tool registry, subagent orchestration, scheduling, OAuth connectors, skill system, and streaming chat UI — as close to 1:1 as possible.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         apps/web                            │
│   Next.js 14 · Streaming SSE · Activity Timeline ·          │
│   Memory Panel · Session Sidebar · Dark UI                  │
└─────────────────────┬───────────────────────────────────────┘
                      │ SSE / REST
┌─────────────────────▼───────────────────────────────────────┐
│                         apps/api                            │
│   Fastify · /api/chat (SSE) · Auth · Sessions · Connectors  │
└──────┬──────────────────────────────────────────────────────┘
       │
       ├── packages/agent-core      ← The Agent Loop
       │     ├── LLMClient          ← Multi-provider (Claude / GPT-4o / Gemini)
       │     ├── AgentLoop          ← Tool-calling loop (up to 50 steps)
       │     └── ContextBuilder     ← System prompt + memory injection
       │
       ├── packages/memory          ← Semantic Memory (pgvector)
       │     └── MemoryClient       ← embed → upsert → semantic search
       │
       ├── packages/tools           ← Tool Registry (~50 first-party tools)
       │     ├── search_web         ← Brave / Tavily
       │     ├── fetch_url          ← Deep page reading
       │     ├── bash               ← Sandboxed code execution
       │     ├── browser_task       ← Playwright cloud browser
       │     ├── filesystem tools   ← read/write/edit/glob/grep
       │     ├── memory tools       ← memory_search / memory_update
       │     └── notification tools ← send_notification / confirm_action
       │
       ├── packages/orchestrator    ← Subagent System
       │     └── SubagentOrchestrator ← Parallel spawn + synthesis
       │
       ├── packages/scheduler       ← Cron + Delayed Jobs (BullMQ)
       │     ├── Scheduler          ← schedule_cron + pause_and_wait
       │     └── Worker             ← Processes background agent jobs
       │
       ├── packages/connectors      ← OAuth Connector Framework
       │     └── ConnectorRegistry  ← Pipedream Connect + custom OAuth
       │
       └── packages/skills          ← Skill Playbook System
             └── SkillLoader        ← Load markdown playbooks into context
```

---

## How It Mirrors Computer

| Computer Capability | Infinius Implementation |
|---------------------|------------------------|
| Multi-model LLM routing | `LLMClient` — Claude, GPT-4o, Gemini via unified interface |
| Agentic tool-calling loop | `AgentLoop` — runs until `end_turn`, max 50 steps |
| Persistent memory | `MemoryClient` — pgvector semantic search in Supabase |
| Auto memory extraction | `extractAndStore()` — GPT-4o-mini extracts facts after each turn |
| Context injection | `ContextBuilder` — injects user facts + relevant history into system prompt |
| Sandboxed code execution | `bashTool` — executes shell commands in workspace directory |
| Cloud browser automation | `browserTaskTool` — Playwright (local or cloud via `BROWSER_WS_ENDPOINT`) |
| File workspace | `readFileTool`, `writeFileTool`, `editFileTool` — per-session filesystem |
| Parallel subagents | `SubagentOrchestrator.spawnParallel()` — shared workspace filesystem |
| Recurring scheduled tasks | `Scheduler.createCron()` — BullMQ repeatable jobs |
| Delayed one-time actions | `Scheduler.scheduleDelayed()` — BullMQ delayed jobs |
| Push notifications | `sendNotificationTool` — persisted to DB, surfaced in UI |
| 400+ OAuth connectors | `ConnectorRegistry` — Pipedream Connect integration |
| Skill playbook system | `SkillLoader` — markdown files injected into system prompt |
| SSE streaming | `/api/chat` — Server-Sent Events, streamed text + tool events |
| Activity timeline | `ActivityTimeline` component — tool calls shown in real time |
| Memory panel | `MemoryPanel` component — view and delete stored memories |

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Redis (local or cloud)
- Supabase project (for pgvector memory + auth + storage)
- API keys: Anthropic + OpenAI (minimum)

### 1. Clone and install

```bash
git clone https://github.com/JagNL/infinius.git
cd infinius
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your API keys — at minimum:
#   ANTHROPIC_API_KEY
#   OPENAI_API_KEY       (for embeddings + fast model)
#   SUPABASE_URL
#   SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   REDIS_URL
```

### 3. Run database migrations

```bash
# In your Supabase SQL editor, run:
# infra/supabase/migrations/001_initial_schema.sql
```

### 4. Start development

```bash
pnpm dev
# Web:  http://localhost:3000
# API:  http://localhost:3001
```

Or with Docker:

```bash
cd infra/docker
docker-compose up
```

---

## Package Reference

| Package | Purpose |
|---------|---------|
| `@infinius/agent-core` | LLM client, agent loop, context builder |
| `@infinius/memory` | pgvector memory client |
| `@infinius/tools` | All first-party tool definitions + registry |
| `@infinius/orchestrator` | Subagent spawning and orchestration |
| `@infinius/scheduler` | BullMQ cron + delayed job management |
| `@infinius/connectors` | OAuth connector framework + Pipedream integration |
| `@infinius/skills` | Skill playbook loader |
| `@infinius/shared` | Shared TypeScript types |
| `@infinius/api` | Fastify API server |
| `@infinius/web` | Next.js chat UI |

---

## Key Design Decisions

### Why these technologies?

| Choice | Reason |
|--------|--------|
| **TypeScript throughout** | End-to-end type safety across all packages |
| **Fastify** (not Express) | ~3x faster, better TypeScript support, built-in schema validation |
| **Next.js 14** | App router, RSC, built-in API routes for auth callbacks |
| **BullMQ + Redis** | Production-grade job queue — handles cron, delayed, retries, dead-letter |
| **pgvector (Supabase)** | Same DB as app data, no separate vector DB to manage, cosine similarity |
| **Playwright** | The standard for browser automation — same as Computer uses |
| **pnpm workspaces + Turborepo** | Monorepo with incremental builds, package isolation |

### The Agent Loop

The loop in `packages/agent-core/src/loop/agent-loop.ts` is the core of the system:

```
1. Build context (system prompt + memory + skills)
2. Call LLM with full tool list
3. LLM returns tool calls → execute all in parallel → append results → go to 2
4. LLM returns end_turn → stream final text → exit loop
5. After turn → auto-extract durable facts → upsert to pgvector
```

### Memory Architecture

```
WRITE: conversation turn → GPT-4o-mini extracts facts → embed (text-embedding-3-small)
       → cosine dedup check (skip if >0.95 similar exists) → upsert pgvector

READ:  turn start → parallel semantic queries → top-K results → inject into system prompt
       + always inject "identity" facts (name, role, company) unconditionally
```

### Subagent Pattern

```
Parent detects complex task → spawn N parallel subagents
Each subagent:
  - Gets own context window (prevents parent overflow)
  - Writes findings to workspace/subagents/<id>/
  - Can use all tools except spawning further subagents
Parent reads all output files → synthesises into unified result
```

---

## Extending Infinius

### Add a new tool

```typescript
// packages/tools/src/definitions/my-tool.ts
export const myTool: RegisteredTool = {
  name: 'my_tool',
  description: 'What this tool does',
  category: 'research',
  isVisible: true,
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  async execute(input, opts) {
    // your implementation
    return { success: true, output: { result: '...' } };
  },
};

// Then register in packages/tools/src/index.ts
```

### Add a skill playbook

```markdown
<!-- packages/skills/playbooks/my-skill.md -->
# My Skill

Instructions for the agent when this skill is active...
```

### Add a connector

```typescript
// packages/connectors/src/connector-registry.ts
// Add to CONNECTOR_CATALOGUE array:
{
  sourceId: 'my-service',
  name: 'My Service',
  description: 'What it does',
  category: 'communication',
  tools: [
    { name: 'do_thing', description: '...', inputSchema: {...} }
  ],
}
// Then add a handler in getConnectorHandler()
```

---

## Documentation

Full documentation lives in the `/docs` folder:

| Document | What it covers |
|----------|----------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Every system in depth — agent loop, memory, tools, subagents, scheduler, connectors, skills, UI, DB schema, security |
| [DATA_FLOWS.md](docs/DATA_FLOWS.md) | Step-by-step traces: full agent turn, memory read/write, subagent lifecycle, scheduler lifecycle, OAuth flow |
| [TOOLS_REFERENCE.md](docs/TOOLS_REFERENCE.md) | Every tool: name, inputs, outputs, backend, when to use |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment on Vercel + Railway/Fly.io + Supabase + Redis, Dockerfile, env var reference |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, adding tools/skills/connectors, debugging, common issues |

---

## Roadmap

- [ ] Document generation (DOCX, PPTX, XLSX) via `packages/documents`
- [ ] Media generation (images via DALL-E / Stable Diffusion, TTS via ElevenLabs)
- [ ] Website builder + deploy to S3/Vercel
- [ ] Batch research (`wide_research` / `wide_browse` equivalents)
- [ ] Real-time collaboration (multiple users in one session)
- [ ] Desktop app with local browser session (Electron/Tauri)
- [ ] Plugin marketplace for community skills
- [ ] Billing / credit system

---

## License

MIT
