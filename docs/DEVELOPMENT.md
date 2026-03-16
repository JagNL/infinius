# Infinius — Development Guide

Everything you need to run, debug, and extend Infinius locally.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm install -g pnpm` |
| Redis | 7+ | `brew install redis` or Docker |
| Supabase account | — | [supabase.com](https://supabase.com) |
| Anthropic API key | — | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI API key | — | [platform.openai.com](https://platform.openai.com) |

---

## Local Setup

```bash
# 1. Clone
git clone https://github.com/JagNL/infinius.git
cd infinius

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env — fill in ANTHROPIC_API_KEY, OPENAI_API_KEY,
# SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# REDIS_URL

# 4. Run database migrations
# Open Supabase dashboard → SQL editor
# Paste and run: infra/supabase/migrations/001_initial_schema.sql

# 5. Start Redis (if running locally)
redis-server

# 6. Start all services
pnpm dev
# Web:  http://localhost:3000
# API:  http://localhost:3001
```

---

## Running Services Individually

```bash
# API only
pnpm --filter @infinius/api dev

# Web only
pnpm --filter @infinius/web dev

# Watch a specific package
pnpm --filter @infinius/agent-core dev
```

---

## Project Structure

```
infinius/
├── apps/
│   ├── api/                    ← Fastify API server
│   │   └── src/
│   │       ├── index.ts        ← Server entry point
│   │       └── routes/         ← Route handlers
│   │           ├── chat.ts     ← Main agent endpoint (SSE)
│   │           ├── sessions.ts
│   │           ├── memory.ts
│   │           ├── connectors.ts
│   │           ├── notifications.ts
│   │           └── cron.ts
│   └── web/                    ← Next.js chat UI
│       └── app/
│           ├── page.tsx        ← Root page (state + SSE client)
│           └── globals.css
│       └── components/
│           ├── chat/           ← MessageList, ChatInput
│           ├── tools/          ← ActivityTimeline
│           ├── memory/         ← MemoryPanel
│           └── layout/         ← SessionSidebar
│
├── packages/
│   ├── agent-core/             ← LLM client + agent loop + context builder
│   ├── memory/                 ← pgvector memory client
│   ├── tools/                  ← Tool registry + all tool definitions
│   ├── orchestrator/           ← Subagent spawning
│   ├── scheduler/              ← BullMQ cron + delayed jobs
│   ├── connectors/             ← OAuth connector framework
│   ├── skills/                 ← Skill playbook loader
│   └── shared/                 ← Shared TypeScript types
│
├── infra/
│   ├── supabase/
│   │   └── migrations/         ← SQL migrations
│   └── docker/
│       └── docker-compose.yml
│
├── docs/                       ← You are here
│   ├── ARCHITECTURE.md
│   ├── DATA_FLOWS.md
│   ├── TOOLS_REFERENCE.md
│   ├── DEPLOYMENT.md
│   └── DEVELOPMENT.md (this file)
│
├── .env.example                ← All env vars documented
├── package.json                ← pnpm workspace root
├── turbo.json                  ← Turborepo build pipeline
└── tsconfig.base.json          ← Shared TypeScript config
```

---

## TypeScript

All packages share `tsconfig.base.json` as the base. Each package extends it:

```json
// packages/agent-core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"]
}
```

Build all packages:
```bash
pnpm build
```

Type-check without building:
```bash
pnpm typecheck
```

---

## Adding a New Package

```bash
# 1. Create the directory
mkdir -p packages/my-package/src

# 2. Create package.json
cat > packages/my-package/package.json << 'EOF'
{
  "name": "@infinius/my-package",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "devDependencies": { "typescript": "^5.5.0" }
}
EOF

# 3. Create tsconfig.json
cat > packages/my-package/tsconfig.json << 'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"]
}
EOF

# 4. Create src/index.ts
# 5. Add to other packages via workspace:*:
#    "@infinius/my-package": "workspace:*"
```

---

## Adding a New Tool

1. Create the tool definition file:

```typescript
// packages/tools/src/definitions/my-tool.ts
import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';

export const myTool: RegisteredTool = {
  name: 'my_tool_name',              // snake_case, unique
  description: `Clear description of what this tool does and when to use it.
Include examples if helpful. The LLM reads this to decide when to call the tool.`,
  category: 'research',              // pick appropriate category
  isVisible: true,                   // show in activity timeline?
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look up' },
    },
    required: ['query'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { query } = input as { query: string };

    // Your implementation here
    const result = await doSomething(query);

    return {
      success: true,
      output: { result },
      userDescription: `Looking up: ${query}`,
    };
  },
};
```

2. Register in `packages/tools/src/index.ts`:

```typescript
import { myTool } from './definitions/my-tool.js';

export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerMany([
    // ... existing tools ...
    myTool,  // add here
  ]);
  return registry;
}
```

3. Document in `docs/TOOLS_REFERENCE.md`.

---

## Adding a Skill Playbook

Skills are markdown files. No code needed.

```bash
# Simple skill
cat > packages/skills/playbooks/my-skill.md << 'EOF'
# My Skill Title

Brief description of when this skill is relevant.

## Instructions

Step-by-step guidance for the agent...

## Output Format

What the deliverable should look like...

## Quality Checks

What to verify before marking complete...
EOF
```

For sub-skills (e.g. `office/pptx`):
```bash
mkdir -p packages/skills/playbooks/office
cat > packages/skills/playbooks/office/pptx.md << 'EOF'
...
EOF
```

The agent loads it with `load_skill({ name: 'office/pptx' })`.

---

## Debugging

### Verbose agent loop logging

In `packages/agent-core/src/loop/agent-loop.ts`, add:

```typescript
console.log(`[Loop] Step ${steps}: ${response.toolCalls.length} tool calls`);
console.log(`[Loop] Tools called:`, response.toolCalls.map(tc => tc.name));
```

### Inspect memory store

```bash
# Connect to your Supabase DB and run:
SELECT category, content, created_at
FROM memories
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC
LIMIT 20;
```

### Inspect BullMQ jobs

Open Bull Board at `http://localhost:3002` (Docker Compose) to see queued, active, completed, and failed jobs.

### Test the agent without the UI

```typescript
// scripts/test-agent.ts
import { AgentLoop, ContextBuilder } from '@infinius/agent-core';
import { MemoryClient } from '@infinius/memory';
import { buildDefaultRegistry } from '@infinius/tools';

const loop = new AgentLoop();
const memClient = new MemoryClient();
const ctxBuilder = new ContextBuilder();

const systemPrompt = await ctxBuilder.build({
  userId: 'test-user',
  sessionId: 'test-session',
  userMessage: 'What is the current price of Anthropic stock?',
  memoryClient: memClient,
});

const result = await loop.run(
  [{ role: 'user', content: 'What is the current price of Anthropic stock?' }],
  {
    sessionId: 'test-session',
    userId: 'test-user',
    workspacePath: '/tmp/test-workspace',
    modelConfig: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    systemPrompt,
    tools: buildDefaultRegistry().getAll(),
    onTextChunk: (chunk) => process.stdout.write(chunk),
    onToolStart: (name, _, desc) => console.log(`\n[Tool] ${name}: ${desc}`),
  }
);

console.log(`\n\nCompleted in ${result.steps} steps`);
```

```bash
npx tsx scripts/test-agent.ts
```

---

## Common Issues

### `Cannot find module '@infinius/agent-core'`

Packages need to be built before they can be imported. Run:
```bash
pnpm build
```
Or start the watch mode: `pnpm dev` (which runs all packages in watch mode).

### Memory search returns no results

The `memories` table is empty until the agent has a few conversations. The first turn won't have memory context — that's expected. After 2–3 conversations, `memory_search` will return relevant facts.

### pgvector not found

You need to enable the `vector` extension in Supabase before running migrations:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Redis connection refused

Make sure Redis is running:
```bash
redis-server &
redis-cli ping  # should return PONG
```

### Browser automation fails locally

Install Playwright's browser binaries:
```bash
cd packages/tools
npx playwright install chromium
npx playwright install-deps
```
