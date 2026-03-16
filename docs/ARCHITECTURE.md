# Infinius — Architecture Deep Dive

This document covers every system in Infinius with enough depth to understand, extend, or replace any component.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [The Agent Loop](#the-agent-loop)
3. [LLM Client — Multi-Model Routing](#llm-client--multi-model-routing)
4. [Context Builder — What Goes into Every Prompt](#context-builder--what-goes-into-every-prompt)
5. [Tool System](#tool-system)
6. [Memory System](#memory-system)
7. [Subagent Orchestration](#subagent-orchestration)
8. [Scheduler — Cron + Delayed Jobs](#scheduler--cron--delayed-jobs)
9. [Connector Framework — OAuth Integrations](#connector-framework--oauth-integrations)
10. [Skill System](#skill-system)
11. [API Server](#api-server)
12. [Web UI](#web-ui)
13. [Database Schema](#database-schema)
14. [Workspace Filesystem](#workspace-filesystem)
15. [Security Model](#security-model)
16. [Package Dependency Graph](#package-dependency-graph)

---

## System Overview

Infinius is a **stateless LLM agent** with a **rich tool-calling layer** running in a loop, backed by:

- **pgvector** (Supabase) for persistent semantic memory
- **BullMQ + Redis** for scheduled and background jobs
- **Playwright** for browser automation
- **Pipedream Connect** for 400+ OAuth integrations
- **Per-session filesystem workspace** shared across the main agent and any subagents it spawns

The key insight is that the "agent" is not a long-running process — it is stateless. Every turn, the system:
1. Reconstructs context (memory + history + skills) fresh
2. Calls the LLM with a tool list
3. Executes whatever tools the LLM calls
4. Loops until the LLM says it's done
5. Persists new facts to memory

```
User message
     │
     ▼
ContextBuilder ──── pgvector (memory search) ──┐
     │                                          │
     │  system prompt = base + user facts       │
     │                + relevant history        │
     │                + loaded skills           │
     ▼                                          │
AgentLoop ──────────────────────────────────────┘
     │
     ├── Call LLM (Claude / GPT-4o / Gemini)
     │       │
     │       ├── end_turn → stream text → done
     │       │
     │       └── tool_calls → execute in parallel
     │                │
     │                ├── bash (code execution)
     │                ├── search_web (Brave/Tavily)
     │                ├── browser_task (Playwright)
     │                ├── read/write files (workspace)
     │                ├── memory_search / memory_update
     │                ├── run_subagent (spawn child agent)
     │                ├── schedule_cron / pause_and_wait
     │                ├── call_external_tool (connectors)
     │                └── ... (50+ tools)
     │                │
     │                └── results appended to message list
     │                       → loop back to LLM
     │
     ▼
extractAndStore() ── embed → dedup → pgvector upsert
```

---

## The Agent Loop

**File**: `packages/agent-core/src/loop/agent-loop.ts`

The loop is the single most important file in the codebase. Everything else exists to support it.

### How it works

```typescript
while (steps < MAX_STEPS) {   // MAX_STEPS = 50
  const response = await llm.complete(modelConfig, messages, tools);

  if (response.stopReason === 'end_turn') break;   // done

  // Execute all tool calls in parallel
  const results = await Promise.all(
    response.toolCalls.map(tc => tools[tc.name].execute(tc.input, opts))
  );

  // Append tool results to message history and loop
  messages.push(...toolResultMessages(results));
}
```

### Why parallel tool execution matters

When the LLM calls three tools in one turn (e.g. three `search_web` queries), they execute simultaneously. This is why research tasks complete quickly — 10 parallel searches take the same wall-clock time as 1.

### The 50-step limit

This is a safety valve. In practice, most tasks complete in 3–10 steps. Complex tasks (full research + document generation) might use 20–30. If a task exceeds 50 steps, it almost certainly indicates a bug or infinite loop.

### Message format across the loop

```
[system]     ← context builder output (rebuilt every turn)
[user]       ← original user message
[assistant]  ← LLM response with tool calls
[tool]       ← results for each tool call (keyed by tool_call_id)
[assistant]  ← next LLM response
[tool]       ← more tool results
...
[assistant]  ← final response (end_turn, no tool calls)
```

---

## LLM Client — Multi-Model Routing

**File**: `packages/agent-core/src/llm/client.ts`

### Supported models

| Model | Provider | Use case |
|-------|----------|----------|
| `claude-3-5-sonnet-20241022` | Anthropic | Default — best reasoning, best at tool use |
| `claude-3-5-haiku-20241022` | Anthropic | Fast + cheap for simple tasks |
| `gpt-4o` | OpenAI | Strong alternative, good at structured output |
| `gpt-4o-mini` | OpenAI | Fast model for fact extraction, embeddings |
| `gemini-1.5-pro-latest` | Google | Long context (1M tokens), good for docs |
| `gemini-1.5-flash-latest` | Google | Fast Google model |

### How routing works

The `ModelConfig` object is passed into every `AgentLoop.run()` call. The parent agent selects a model based on the task; subagents can be given different models.

```typescript
// Default: Claude for main agent
const modelConfig: ModelConfig = {
  modelId: 'claude-3-5-sonnet-20241022',
  provider: 'anthropic',
};

// Cheap model for a batch subagent
const cheapConfig: ModelConfig = {
  modelId: 'gpt-4o-mini',
  provider: 'openai',
};
```

### Provider normalisation

Each provider has different API shapes (Anthropic uses `tool_use` blocks, OpenAI uses `tool_calls` arrays, Google has function calling). The `LLMClient` normalises all three to the same `LLMResponse` type so the agent loop never knows which provider it's talking to.

### Streaming

The `/api/chat` route currently uses the non-streaming `complete()` method and manually fires `onTextChunk` callbacks. For true token-by-token streaming, replace with `llm.stream()` — the `streamAnthropic()` and `streamOpenAI()` methods are already implemented.

---

## Context Builder — What Goes into Every Prompt

**File**: `packages/agent-core/src/loop/context-builder.ts`

Every agent turn starts with `ContextBuilder.build()`. It assembles the system prompt by combining:

### 1. Base system prompt

A fixed instruction set establishing the agent's identity, capabilities, and core principles (prefer doing over asking, run things in parallel, cite sources, etc.).

### 2. Session metadata

```xml
<session>
Session ID: sess_abc123
Current time: Sun, 16 Mar 2026 02:00:00 UTC
User ID: user_xyz
</session>
```

### 3. Memory injection (two types)

**Identity facts** — always injected, no similarity threshold:
```xml
<user_background>
Facts about this user:
- The user works as a Senior PM at Acme Corp
- The user prefers bullet-point summaries
- The user is building a marketplace app called WhipGuides
</user_background>
```

**Relevant history** — semantic search against user's message:
```xml
<relevant_memory>
Relevant past context:
- Completed competitive analysis for WhipGuides (2026-03-10)
- User prefers dark-themed UI (2026-03-08)
</relevant_memory>
```

### 4. Loaded skills

```xml
<skill>
# Research Assistant Skill

Load this skill BEFORE answering ANY factual question...
</skill>
```

### Why context is rebuilt every turn

The agent is stateless between turns. Rebuilding context fresh ensures:
- Memory search reflects the latest message (not stale from turn start)
- Skills can change between turns
- No stale state from previous tool calls leaks into context

---

## Tool System

**Files**: `packages/tools/src/`

### Tool anatomy

Every tool is a `RegisteredTool`:

```typescript
interface RegisteredTool {
  name: string;          // unique identifier, snake_case
  description: string;   // what the LLM reads to decide when to use this
  category: ToolCategory;
  isVisible: boolean;    // whether to show in the activity timeline
  inputSchema: JSONSchema;
  execute: (input, opts) => Promise<ToolResult>;
}
```

The `description` field is critical — it must be precise enough for the LLM to select the right tool and understand its limitations.

### Tool categories

| Category | Tools |
|----------|-------|
| `research` | search_web, fetch_url, search_vertical |
| `browser` | browser_task, screenshot_page |
| `code` | bash |
| `filesystem` | read_file, write_file, edit_file, glob_files, grep_files |
| `memory` | memory_search, memory_update |
| `orchestration` | run_subagent, load_skill |
| `scheduling` | schedule_cron, pause_and_wait |
| `connector` | list_external_tools, call_external_tool |
| `notification` | send_notification, submit_answer, confirm_action |

### How tools reach the agent

At request time in `apps/api/src/routes/chat.ts`:

```typescript
const toolRegistry = buildDefaultRegistry();        // first-party tools
const connectorTools = await connectorRegistry      // OAuth connector tools
  .buildConnectorTools(userId);

const allTools = [
  ...toolRegistry.getAll(),
  ...connectorTools,
  runSubagentTool,     // orchestration
  scheduleCronTool,    // scheduling
  pauseAndWaitTool,
  listExternalToolsTool,
  callExternalToolTool,
  loadSkillTool,
];
```

Connector tools are built fresh each request from the user's connected accounts — so the tool list dynamically reflects what services the user has linked.

### The `ToolExecuteOptions` context

Every tool receives:

```typescript
interface ToolExecuteOptions {
  sessionId: string;     // current conversation session
  workspacePath: string; // sandboxed filesystem path for this session
  userId: string;        // for auth + memory scoping
  signal?: AbortSignal;  // for cancellation
}
```

This gives tools access to the workspace without needing global state.

---

## Memory System

**Files**: `packages/memory/src/client.ts`, `infra/supabase/migrations/001_initial_schema.sql`

### The two paths

#### Write path (auto-learning)

After every completed agent turn, the API calls `extractAndStore()`:

```
User message + Assistant response
        │
        ▼
GPT-4o-mini extraction prompt:
  "Extract durable facts about the user..."
  Returns: [{ category: 'identity', content: '...' }, ...]
        │
        ▼
For each fact:
  1. Embed with text-embedding-3-small (1536 dims)
  2. Query pgvector: any existing entry with similarity > 0.95?
  3. If yes → skip (already known)
  4. If no  → INSERT into memories table
```

#### Read path (semantic recall)

At the start of `ContextBuilder.build()`:

```
User's new message
        │
        ├── embed("user message")
        │       │
        │       └── pgvector cosine search → top-5 relevant memories
        │
        └── SELECT * FROM memories WHERE category = 'identity' LIMIT 20
                │
                └── always injected (no similarity gate)
```

Both queries run in parallel (`Promise.all`).

### Memory categories

| Category | What it stores | Example |
|----------|---------------|---------|
| `identity` | Name, role, company, team, colleagues | "The user is a Senior PM at Acme Corp" |
| `preferences` | Style, formatting, tools used | "The user prefers bullet-point summaries" |
| `projects` | Active work, goals, deadlines | "The user is building WhipGuides, a motorsports marketplace" |
| `history` | Key exchanges and past work | "Completed competitive analysis for WhipGuides on 2026-03-10" |
| `corrections` | Explicit user corrections | "The user said: never use exclamation points" |

### pgvector index

```sql
CREATE INDEX idx_memories_embedding ON public.memories
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

`ivfflat` with 100 lists gives approximate nearest-neighbour search at ~10ms for millions of vectors. For larger datasets, use `hnsw` instead (exact search, better recall).

### The deduplication threshold

`0.95` cosine similarity means "these two facts are essentially saying the same thing." Lower it to `0.85` if you want stricter deduplication (fewer stored facts, more risk of missing nuance). Raise it to `0.99` if you want to allow near-duplicate facts (more stored facts, more recall noise).

---

## Subagent Orchestration

**File**: `packages/orchestrator/src/subagent.ts`

### Why subagents exist

Two problems subagents solve:

1. **Context window overflow**: A single agent researching 50 companies would have a 200k+ token context by the end, causing quality degradation. Subagents each have a fresh 8k context.

2. **Parallelism**: Researching 50 companies serially takes 50x as long. Spawning 50 subagents in parallel takes the same wall-clock time as 1.

### Spawning a subagent

```typescript
const result = await orchestrator.spawn({
  subagentId: 'sub-abc123',
  parentSessionId: 'sess-xyz',
  parentUserId: userId,
  workspacePath: '/tmp/infinius-workspaces/userId/sessionId',
  objective: 'Research Acme Corp. Find their founding date, CEO, last funding round, and main products. Save findings to acme-research.md',
  taskName: 'Research Acme Corp',
  modelConfig: { modelId: 'gpt-4o-mini', provider: 'openai' }, // cheap model for research
});

// result.filesCreated = ['subagents/sub-abc123/acme-research.md']
// result.output = "Summary of findings..."
```

### Workspace sharing

The parent's `workspacePath` is passed to every subagent. Subagents write to `workspacePath/subagents/<subagentId>/`. The parent can then read those files:

```
/tmp/infinius-workspaces/userId/sessionId/
  subagents/
    sub-001/   ← subagent 1's files
      acme-research.md
    sub-002/   ← subagent 2's files
      stripe-research.md
    sub-003/
      shopify-research.md
  synthesis.md ← parent writes the final synthesis here
```

### Parallel spawn pattern

```typescript
const jobs = companies.map((company, i) => ({
  subagentId: `sub-${i}`,
  parentSessionId, parentUserId, workspacePath,
  objective: `Research ${company}. Save findings to ${company}-research.md`,
  taskName: `Research ${company}`,
}));

const results = await orchestrator.spawnParallel(jobs);
// All 50 run simultaneously
```

### Subagents cannot spawn subagents

Depth is capped at 1 to prevent exponential spawning. The system prompt injected into subagents includes: "You cannot spawn further subagents."

---

## Scheduler — Cron + Delayed Jobs

**File**: `packages/scheduler/src/scheduler.ts`

### Two primitives

#### `schedule_cron` — Recurring tasks

Backed by BullMQ's `upsertJobScheduler`. Each job is stored in Redis with a cron expression. The worker polls Redis and fires jobs at the right time.

```typescript
// "Monitor competitor prices daily at 9am UTC"
await scheduler.createCron({
  cronId: 'price-monitor-user123',
  userId: 'user123',
  name: 'Daily price monitor',
  task: 'Search for competitor pricing changes and notify me if anything changed from yesterday',
  cron: '0 9 * * *',  // 9am UTC daily
});
```

When fired, the scheduler creates a fresh `AgentLoop` instance and runs the task as a new prompt. The agent has access to all tools (search, notifications, connectors, etc.).

#### `pause_and_wait` — One-time delayed actions

Backed by BullMQ delayed jobs. Used for:
- "Send this email at 9am tomorrow"
- "Follow up if no reply in 48 hours"
- Rate limit cooldowns

```typescript
await scheduler.scheduleDelayed({
  jobId: 'pause-sess123-1234567890',
  userId: 'user123',
  sessionId: 'sess123',
  task: 'Check if the contract was signed and follow up if not',
  delayMs: 48 * 60 * 60 * 1000,  // 48 hours
});
```

### Worker lifecycle

The worker is started in `apps/api/src/index.ts`:

```typescript
const scheduler = new Scheduler();
scheduler.startWorker();
```

BullMQ workers use Redis pub/sub internally. Concurrency is set to 5 — meaning up to 5 background agent jobs can run simultaneously.

### Monitoring jobs

Bull Board (included in Docker Compose on port 3002) provides a web UI to see queued, active, completed, and failed jobs.

---

## Connector Framework — OAuth Integrations

**File**: `packages/connectors/src/connector-registry.ts`

### Architecture

```
ConnectorRegistry
  │
  ├── listConnectors(userId)
  │     → fetch user's connected_accounts from Supabase
  │     → merge with CONNECTOR_CATALOGUE
  │     → return each with status: CONNECTED | DISCONNECTED
  │
  ├── getOAuthUrl(userId, sourceId)
  │     → Pipedream Connect: POST /v1/connect/tokens
  │     → returns connect_link_url (user clicks to authorize)
  │
  ├── callTool(userId, sourceId, toolName, args)
  │     → look up user's access token from connected_accounts
  │     → route to connector handler
  │     → return result
  │
  └── buildConnectorTools(userId)
        → list all CONNECTED connectors
        → for each connector, for each tool definition
        → create a RegisteredTool with execute() that calls callTool()
        → return all as RegisteredTool[]
```

### Adding Pipedream Connect

Pipedream Connect gives access to 400+ pre-built integrations with managed OAuth. To enable it:

1. Create a Pipedream project at [pipedream.com](https://pipedream.com)
2. Set `PIPEDREAM_PROJECT_ID`, `PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET` in `.env`
3. When a user wants to connect a service, call `POST /api/connectors/:id/connect`
4. Redirect the user to the returned `authUrl`
5. Pipedream handles the OAuth flow and stores tokens
6. On completion, save the account to `connected_accounts` in Supabase

### Adding a custom connector

```typescript
// 1. Add to CONNECTOR_CATALOGUE in connector-registry.ts
{
  sourceId: 'my-service',
  name: 'My Service',
  description: 'Description for the agent to understand when to use this',
  category: 'communication',
  tools: [
    {
      name: 'my_service_action',
      description: 'What this action does',
      inputSchema: {
        type: 'object',
        properties: { param: { type: 'string' } },
        required: ['param'],
      },
    },
  ],
}

// 2. Add a handler in getConnectorHandler()
case 'my-service':
  return {
    execute: async (tool, args, account) => {
      // Use account.accessToken to call your service
      const result = await fetch('https://api.my-service.com/...', {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
      return result.json();
    },
  };
```

---

## Skill System

**Files**: `packages/skills/src/skill-loader.ts`, `packages/skills/playbooks/`

### What skills are

Markdown files containing expert instructions for specific domains. When loaded, they are injected into the system prompt inside `<skill>` tags, giving the agent specialised knowledge for the current task.

Examples from the real system:
- `research-assistant` — always search before answering, parallel queries, citation rules
- `office/pptx` — slide layout rules, typography, formatting standards
- `marketing/content-creation` — brand voice, content strategy, tone guidance
- `sales/outreach` — personalisation rules, messaging frameworks

### Skill loading

The agent calls `load_skill({ name: 'research-assistant' })` as a tool call. The `SkillLoader` reads the markdown from disk and returns its content. The agent loop then has that content in its conversation history for the rest of the turn.

### File naming

| Skill name | File path |
|------------|-----------|
| `research-assistant` | `packages/skills/playbooks/research-assistant.md` |
| `office/pptx` | `packages/skills/playbooks/office/pptx.md` |
| `marketing/content-creation` | `packages/skills/playbooks/marketing/content-creation.md` |

### Writing a good skill

Skills should contain:
1. **When to load this skill** — clear trigger conditions
2. **Step-by-step instructions** — specific, ordered, not vague
3. **Output format requirements** — what the deliverable should look like
4. **Quality checks** — what to verify before completing

---

## API Server

**Files**: `apps/api/src/`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Main chat endpoint — SSE stream |
| `GET` | `/api/sessions` | List user's sessions |
| `GET` | `/api/sessions/:id` | Get messages + tool activity for a session |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `GET` | `/api/memory` | List user's memories |
| `DELETE` | `/api/memory/:id` | Delete a specific memory |
| `POST` | `/api/memory/search` | Semantic search over memories |
| `GET` | `/api/connectors` | List connectors with connection status |
| `POST` | `/api/connectors/:id/connect` | Initiate OAuth for a connector |
| `DELETE` | `/api/connectors/:id` | Disconnect a connector |
| `GET` | `/api/notifications` | List notifications |
| `POST` | `/api/notifications/:id/read` | Mark notification as read |
| `GET` | `/api/cron` | List scheduled tasks |
| `DELETE` | `/api/cron/:id` | Delete a scheduled task |
| `GET` | `/health` | Health check |

### SSE event schema

The `/api/chat` endpoint streams these events:

```typescript
// Text being generated
{ type: 'text_delta', text: 'Hello, I found...' }

// Tool starting
{ type: 'tool_activity', toolName: 'search_web', description: 'Searching the web for...' }

// Tool finished
{ type: 'tool_done', toolName: 'search_web', output: { results: [...] } }

// Turn complete
{ type: 'done', steps: 7 }

// Error
{ type: 'error', message: 'Rate limit exceeded' }
```

### Authentication

Currently: Supabase JWT passed as `Authorization: Bearer <token>`. The chat route validates with Supabase `auth.getUser()`. All other routes use `x-user-id` header (TODO: replace with JWT middleware for all routes).

---

## Web UI

**Files**: `apps/web/`

### Component tree

```
page.tsx (root — state management + SSE client)
  ├── SessionSidebar
  │     └── Session list, new session button
  ├── MessageList
  │     └── Per-message: user bubble | assistant (markdown rendered)
  ├── ActivityTimeline
  │     └── Tool call events with icons, status, animation
  ├── ChatInput
  │     └── Textarea, send button, stop button
  └── MemoryPanel (toggle)
        └── Memory cards by category, delete button
```

### SSE client

The main page uses a native `ReadableStream` reader:

```typescript
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // parse SSE lines → dispatch to state handlers
}
```

This gives real-time streaming without any additional dependencies.

### State management

All state lives in `page.tsx` — no global state library. The components are purely presentational. For larger apps, extract to Zustand or Jotai.

---

## Database Schema

**File**: `infra/supabase/migrations/001_initial_schema.sql`

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Extends `auth.users` with display_name, avatar, memory toggle |
| `sessions` | Conversation threads — one per chat session |
| `session_messages` | Every message in every session, with role and tool data |
| `tool_activity` | Every visible tool call — for the activity timeline |
| `memories` | pgvector memory store with category, content, and 1536-dim embedding |
| `connected_accounts` | OAuth tokens for each user-connector pair |
| `scheduled_jobs` | Cron expressions and delayed job definitions |
| `workspace_files` | Tracks files created in agent sessions (for the file sharing UI) |
| `notifications` | In-app notifications sent by the agent |

### Key relationships

```
profiles (1) ──── (N) sessions
sessions (1) ──── (N) session_messages
sessions (1) ──── (N) tool_activity
sessions (1) ──── (N) workspace_files
profiles (1) ──── (N) memories
profiles (1) ──── (N) connected_accounts
profiles (1) ──── (N) scheduled_jobs
profiles (1) ──── (N) notifications
```

### Row-Level Security

Every table has RLS enabled with a `own_data` policy: `auth.uid() = user_id`. Users can only read and write their own data. The API uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for server-side operations.

### Memory search function

```sql
CREATE FUNCTION match_memories(
  p_user_id uuid, p_embedding vector(1536),
  p_threshold float, p_limit int, p_category text
) RETURNS TABLE (id, user_id, category, content, similarity)
```

Called by `MemoryClient.semanticSearch()`. Returns memories ordered by cosine similarity, filtered by threshold and optional category.

---

## Workspace Filesystem

Every session gets a sandboxed directory:

```
WORKSPACE_BASE_PATH/
  {userId}/
    {sessionId}/
      ← agent writes files here
      subagents/
        {subagentId}/
          ← subagent files here (shared with parent)
      cron-{cronId}/
        ← scheduled job files here
```

### Path safety

`resolveSafe()` in `filesystem.ts` prevents path traversal:

```typescript
function resolveSafe(workspacePath: string, filePath: string): string {
  const resolved = path.resolve(workspacePath, filePath);
  if (!resolved.startsWith(workspacePath)) {
    throw new Error('Path traversal attempt blocked');
  }
  return resolved;
}
```

### Production note

In production, use a proper sandboxing solution:
- **E2B** — managed secure sandboxes via API
- **Modal** — serverless containers with filesystem
- **Firecracker microVMs** — for maximum isolation

---

## Security Model

### What is sandboxed

| Component | Sandboxing approach |
|-----------|---------------------|
| Code execution (`bash`) | Child process with timeout + restricted PATH. Replace with E2B/Modal for production |
| Browser automation | Playwright in headless mode. Use `BROWSER_WS_ENDPOINT` for cloud isolation |
| Filesystem | Path traversal prevention via `resolveSafe()`. One directory per session |

### What is not sandboxed

- Network access from `bash` — the agent can make arbitrary HTTP requests
- Package installation via `pip install` or `npm install`

For production deployments where untrusted users can send arbitrary messages, implement proper sandboxing before enabling `bash`.

### Secret handling

- All API keys via environment variables — never in code or DB
- OAuth tokens in `connected_accounts` — encrypt `access_token` at rest (add pgcrypto)
- Supabase RLS ensures users can never access each other's data

---

## Package Dependency Graph

```
@infinius/shared
    └── (no internal deps)

@infinius/agent-core
    ├── @infinius/shared
    ├── @anthropic-ai/sdk
    ├── openai
    └── @google/generative-ai

@infinius/memory
    ├── @infinius/shared
    ├── @supabase/supabase-js
    └── openai (for embeddings)

@infinius/tools
    ├── @infinius/agent-core (types)
    ├── @infinius/memory
    ├── @infinius/shared
    ├── playwright
    └── axios

@infinius/orchestrator
    ├── @infinius/agent-core
    ├── @infinius/memory
    ├── @infinius/tools
    └── @infinius/shared

@infinius/scheduler
    ├── @infinius/agent-core
    ├── @infinius/memory
    ├── @infinius/tools
    ├── @infinius/shared
    └── bullmq + ioredis

@infinius/connectors
    ├── @infinius/agent-core (types)
    ├── @infinius/shared
    └── @supabase/supabase-js

@infinius/skills
    ├── @infinius/agent-core (types)
    └── (reads from filesystem)

@infinius/api
    └── all packages above

@infinius/web
    └── @infinius/shared (types only)
```

No circular dependencies. `@infinius/shared` is the only package with zero internal dependencies.
