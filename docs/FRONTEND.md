# Infinius — Frontend Architecture

The web UI mirrors the Perplexity Computer interface. It is a Next.js 14 app with a single primary surface (the chat) plus several secondary surfaces (settings, connectors, scheduled tasks). Everything communicates with the API via SSE (streaming) and REST.

---

## Table of Contents

1. [What the UI Looks Like](#what-the-ui-looks-like)
2. [Layout & Navigation](#layout--navigation)
3. [The Chat Surface (Primary)](#the-chat-surface-primary)
4. [SSE Event Handling](#sse-event-handling)
5. [The Activity Timeline](#the-activity-timeline)
6. [Inline UI Interrupts](#inline-ui-interrupts)
7. [File Viewer & Downloads](#file-viewer--downloads)
8. [Memory Panel](#memory-panel)
9. [Notifications](#notifications)
10. [Settings: Connectors](#settings-connectors)
11. [Settings: Scheduled Tasks](#settings-scheduled-tasks)
12. [Settings: Memory](#settings-memory)
13. [Model Selector](#model-selector)
14. [Auth Flow](#auth-flow)
15. [Component Map](#component-map)
16. [State Management](#state-management)
17. [What's Implemented vs What's Missing](#whats-implemented-vs-whats-missing)

---

## What the UI Looks Like

Three-column layout (mirroring Computer):

```
┌──────────────┬────────────────────────────────────┬──────────────┐
│              │                                    │              │
│  Session     │         Chat Area                  │   Context    │
│  Sidebar     │                                    │   Panel      │
│              │   [User message]                   │   (Memory    │
│  • Session 1 │                                    │    Panel /   │
│  • Session 2 │   [Assistant response]             │    File      │
│  • Session 3 │   streaming with markdown          │    Viewer)   │
│              │                                    │              │
│  + New       │   ── Activity Timeline ──          │              │
│              │   🔍 Searching the web...  ✓       │              │
│              │   🤖 Spawning subagent...  ✓       │              │
│              │   ⚡ Running bash script... ●      │              │
│              │                                    │              │
│              │  ┌──────────────────────────────┐  │              │
│              │  │  Type a message...      [▶]  │  │              │
│              │  └──────────────────────────────┘  │              │
└──────────────┴────────────────────────────────────┴──────────────┘
```

The right panel toggles between:
- Memory panel (user facts)
- File viewer (agent-created files)
- Nothing (default — full-width chat)

---

## Layout & Navigation

**Top-level layout** (`apps/web/app/layout.tsx`):
- Dark theme (`bg-gray-950`)
- No top navbar in the chat view (distraction-free)
- Settings accessible via icon in the sidebar footer

**Routes**:

| Route | Surface |
|-------|---------|
| `/` | Main chat |
| `/settings/connectors` | OAuth connector management |
| `/settings/memory` | View/edit all memories |
| `/settings/scheduled` | Manage recurring tasks |
| `/settings/profile` | User profile + preferences |

---

## The Chat Surface (Primary)

**File**: `apps/web/app/page.tsx`

The chat surface has four responsibilities:

1. **Sending messages** — POST to `/api/chat`, attach `sessionId`
2. **Streaming responses** — read SSE stream, dispatch events to state
3. **Rendering messages** — markdown with syntax highlighting, citations as inline links
4. **Surfacing tool activity** — show what the agent is doing in real time

### Message rendering

Assistant messages are rendered as markdown with:
- `react-markdown` + `remark-gfm` for tables, strikethrough, task lists
- `highlight.js` for code block syntax highlighting
- Inline citations formatted as `[Source Name](url)` → rendered as clickable links
- Images rendered inline (for generated images, screenshots)
- File attachments shown as download cards (not inline image tags)

### Streaming cursor

While the assistant is generating, show a blinking cursor at the end of the current text:
```typescript
{message.isStreaming && message.content.length === 0 && (
  <span className="animate-pulse">▊</span>
)}
```

---

## SSE Event Handling

**All events the API sends and what the UI does with each:**

| Event | UI action |
|-------|-----------|
| `text_delta` | Append `text` to the current assistant message |
| `tool_activity` | Add entry to ActivityTimeline with spinning indicator |
| `tool_done` | Update that entry to ✓ completed |
| `file_shared` | Add file card to the message; open FileViewer in right panel |
| `confirm_action` | Render ConfirmActionDialog inline in the chat |
| `ask_user_question` | Render AskUserQuestionDialog inline in the chat |
| `notification` | Trigger NotificationBadge increment |
| `todo_update` | Render/update TodoList component inline |
| `done` | Mark streaming complete, hide cursor, enable input |
| `error` | Show error state in the message bubble |

The `confirm_action` and `ask_user_question` events **pause the input** — the user must respond before the agent can continue. The chat input is disabled until the interrupt is resolved.

---

## The Activity Timeline

**File**: `apps/web/components/tools/ActivityTimeline.tsx`

Shown between the last assistant message and the input box while the agent is working. Each tool call appears as a row:

```
🔍 Searching the web for "Stripe pricing 2026"        ✓
🌐 Reading stripe.com/pricing                          ✓
🤖 Researching competitor: Paddle                      ●  ← spinning
⚡ Running Python analysis script                       ●
```

**States**:
- `running` — animated pulse dot, indigo text
- `completed` — green ✓ checkmark, muted text
- `failed` — red ✗, error text

**Collapsing**: After the turn completes, the timeline collapses to a single summary line (e.g. "Used 6 tools · 8 steps"). Clicking expands it. Computer does this to keep the UI clean for long tasks.

**Tool icons** (full map):

| Tool | Icon |
|------|------|
| search_web | 🔍 |
| fetch_url | 🌐 |
| bash | ⚡ |
| browser_task | 🖥️ |
| screenshot_page | 📸 |
| read_file | 📄 |
| write_file | ✏️ |
| edit_file | ✏️ |
| glob_files | 📁 |
| grep_files | 🔎 |
| memory_search | 🧠 |
| memory_update | 💾 |
| run_subagent | 🤖 |
| load_skill | 📚 |
| schedule_cron | ⏰ |
| pause_and_wait | ⏸️ |
| send_notification | 🔔 |
| confirm_action | ✅ |
| list_external_tools | 🔌 |
| call_external_tool | ⚙️ |
| share_file | 📎 |
| deploy_website | 🚀 |

---

## Inline UI Interrupts

These are components that render **inside the chat stream** when the agent needs user input. The agent loop is suspended until the user responds.

### ConfirmActionDialog

Triggered by `confirm_action` SSE event. Renders as an inline card:

```
┌──────────────────────────────────────────────────────────┐
│  ✅ Confirm Action                                        │
│                                                          │
│  Send this email to john@acme.com?                       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Subject: Q4 Review Follow-up                       │  │
│  │                                                    │  │
│  │ Hi John, following up on our Q4 discussion...      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  [  Deny  ]                          [  Approve  ]       │
└──────────────────────────────────────────────────────────┘
```

On Approve: `POST /api/confirmations/:id/approve`
On Deny: `POST /api/confirmations/:id/deny`
Both: agent loop resumes, input re-enabled.

**File**: `apps/web/components/chat/ConfirmActionDialog.tsx`

### AskUserQuestionDialog

Triggered by `ask_user_question` SSE event. Renders as an inline card with multiple-choice options:

```
┌──────────────────────────────────────────────────────────┐
│  Which format should I use for the report?               │
│                                                          │
│  ○  PDF (Recommended)                                    │
│     Best for sharing externally                         │
│                                                          │
│  ○  Word Document (.docx)                                │
│     Editable, good for internal use                     │
│                                                          │
│  ○  Google Slides                                        │
│     Presentation format                                 │
│                                                          │
│  ○  Other (type below)                                   │
│     ┌──────────────────┐                                 │
│     └──────────────────┘                                 │
└──────────────────────────────────────────────────────────┘
```

Supports `multi_select: true` for checkbox-style questions.
On answer: `POST /api/questions/:id/answer` with selected option(s).

**File**: `apps/web/components/chat/AskUserQuestionDialog.tsx`

### TodoList (inline progress tracker)

When the agent calls `update_todo_list`, render a checklist inside the chat:

```
  Competitive Analysis — Stripe vs Paddle vs Lemon Squeezy

  ✓  Research Stripe pricing
  ✓  Research Paddle pricing
  ●  Research Lemon Squeezy pricing    ← in progress
  ○  Compare feature sets
  ○  Generate comparison table
```

Updates in real time as `update_todo_status` events arrive.

**File**: `apps/web/components/chat/TodoList.tsx`

---

## File Viewer & Downloads

When the agent creates a file and calls `share_file`, the UI should:

1. Show an **inline file card** in the chat message:

```
┌──────────────────────────────────────────┐
│  📄  competitive-analysis.pdf            │
│      2.4 MB · PDF                        │
│                                          │
│  [  Preview  ]          [  Download  ]   │
└──────────────────────────────────────────┘
```

2. Open the **FileViewer** panel on the right for previewable types (PDF, images, HTML).

3. For versioned files (same `asset_name` pushed multiple times), show a version toggle:
```
  v3 (latest) ▾
  v2
  v1
```

**Supported preview types**:
- PDF → `<iframe>` or PDF.js
- PNG/JPEG/WebP → `<img>`
- HTML → sandboxed `<iframe>` (deployed websites)
- CSV → table preview
- Code files → syntax-highlighted `<pre>`
- DOCX/PPTX/XLSX → download only (no browser preview)

**File**: `apps/web/components/files/FileViewer.tsx`
**File**: `apps/web/components/files/FileCard.tsx`

---

## Memory Panel

**File**: `apps/web/components/memory/MemoryPanel.tsx` (exists, needs expansion)

Current state: shows a list of memories, allows deletion.

Missing:
- **Category filter tabs**: All / Identity / Preferences / Projects / History / Corrections
- **Search bar** within the panel
- **"Add manually"** button — user can type a fact directly
- **Edit in place** — click a memory to edit its content
- **Export memories** — download as JSON

The memory panel should make the user feel in control of what the agent knows about them. Every memory card shows when it was created and which session created it.

---

## Notifications

**File**: `apps/web/components/layout/NotificationsPanel.tsx` ← missing

A bell icon in the sidebar header shows an unread badge count. Clicking opens a panel:

```
┌──────────────────────────────────────────┐
│  Notifications                    Mark all read │
│                                          │
│  🔔  New investor email           2m ago │
│      Email from Sequoia Capital:         │
│      "Following up on your deck..."      │
│      Checking hourly                     │
│                                          │
│  🔔  Competitor price change      1h ago │
│      Stripe raised Pro plan to $25/mo    │
│      Checking daily                      │
└──────────────────────────────────────────┘
```

Each notification links to a URL if provided. The `schedule_description` field ("Checking hourly") is shown to remind the user which scheduled task generated it.

**Polling vs WebSocket**: Poll `GET /api/notifications` every 30 seconds, or use Supabase Realtime to push new notifications immediately.

---

## Settings: Connectors

**Route**: `/settings/connectors`
**File**: `apps/web/app/settings/connectors/page.tsx` ← missing

```
┌─────────────────────────────────────────────────────────────┐
│  Integrations                                               │
│                                                             │
│  Connected (3)                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ✓ Gmail        Communication    [Disconnect]        │   │
│  │  ✓ GitHub       Development      [Disconnect]        │   │
│  │  ✓ Notion       Documents        [Disconnect]        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  Available (search to filter)                               │
│  ┌─────────────────────┐                                    │
│  │ 🔍 Search...        │                                    │
│  └─────────────────────┘                                    │
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  Slack  │ │ Linear  │ │HubSpot  │ │ Jira    │          │
│  │  [Link] │ │  [Link] │ │ [Link]  │ │ [Link]  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────────────────────────────────────────────┘
```

Clicking "Link" → calls `POST /api/connectors/:id/connect` → redirect to OAuth URL.
After OAuth completes → redirect back → connector shows as Connected.

---

## Settings: Scheduled Tasks

**Route**: `/settings/scheduled`
**File**: `apps/web/app/settings/scheduled/page.tsx` ← missing

```
┌─────────────────────────────────────────────────────────────┐
│  Scheduled Tasks                              [+ New Task]  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ⏰  Hourly inbox check                    Active    │   │
│  │     Every hour · Checks Gmail for investor replies   │   │
│  │     Last run: 45 min ago · Next run: 15 min          │   │
│  │                                    [Pause] [Delete]  │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  ⏰  Daily price monitor                  Active    │   │
│  │     Daily at 9am UTC · Checks competitor prices      │   │
│  │     Last run: 6 hours ago · Next run: 18 hours       │   │
│  │                                    [Pause] [Delete]  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

Delete calls `DELETE /api/cron/:id`. There is no pause — BullMQ jobs are either active or deleted. (Implement pause by storing a `status: 'paused'` flag in Supabase and checking it in the worker before executing.)

---

## Settings: Memory

**Route**: `/settings/memory`
**File**: `apps/web/app/settings/memory/page.tsx` ← missing

Full-page version of the Memory Panel with:
- All memories paginated
- Filter by category
- Full-text search
- Bulk delete
- Export as JSON
- Toggle to disable memory entirely (update `profiles.memory_enabled`)

---

## Model Selector

**File**: `apps/web/components/chat/ModelSelector.tsx` ← missing

A small dropdown in the chat input area letting the user choose which model to use for the current session. Computer exposes this — it's a key differentiator.

```
  [Claude 3.5 Sonnet ▾]
  ─────────────────────
  ✓ Claude 3.5 Sonnet     Best quality
    Claude 3.5 Haiku       Faster, cheaper
    GPT-4o                 OpenAI
    GPT-4o mini            Fast + cheap
    Gemini 1.5 Pro         Long context
    Gemini 1.5 Flash       Fast Google
```

The selected model is passed as `modelId` in the chat POST body. The API routes it to the correct provider via `LLMClient`.

---

## Auth Flow

Currently: the API validates Supabase JWTs. The web app needs a proper auth surface.

**What's needed**:

1. **`/login` page** — email/password + Google OAuth via Supabase Auth
2. **`/signup` page** — new account creation
3. **Auth middleware** in Next.js (`middleware.ts`) — redirect to `/login` if no session
4. **Auth provider** component — wraps the app with Supabase session context

```typescript
// apps/web/middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session && !req.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}
```

---

## Component Map

Full inventory of all components — ✓ implemented, ○ missing:

### `apps/web/app/`
| File | Status | Description |
|------|--------|-------------|
| `page.tsx` | ✓ | Root chat page |
| `layout.tsx` | ✓ | Root layout |
| `globals.css` | ✓ | Tailwind + custom styles |
| `login/page.tsx` | ○ | Login page |
| `signup/page.tsx` | ○ | Signup page |
| `settings/connectors/page.tsx` | ○ | Connector management |
| `settings/memory/page.tsx` | ○ | Memory management |
| `settings/scheduled/page.tsx` | ○ | Scheduled tasks |
| `settings/profile/page.tsx` | ○ | User profile |
| `middleware.ts` | ○ | Auth guard |

### `apps/web/components/chat/`
| File | Status | Description |
|------|--------|-------------|
| `MessageList.tsx` | ✓ | Message list with markdown |
| `ChatInput.tsx` | ✓ | Input + send/stop buttons |
| `ConfirmActionDialog.tsx` | ○ | Inline approval prompt |
| `AskUserQuestionDialog.tsx` | ○ | Inline multiple-choice prompt |
| `TodoList.tsx` | ○ | Inline task checklist |
| `ModelSelector.tsx` | ○ | Model picker dropdown |

### `apps/web/components/tools/`
| File | Status | Description |
|------|--------|-------------|
| `ActivityTimeline.tsx` | ✓ (basic) | Tool call stream |
| `ActivityTimelineItem.tsx` | ○ | Individual tool row with expand |

### `apps/web/components/files/`
| File | Status | Description |
|------|--------|-------------|
| `FileCard.tsx` | ○ | Inline file attachment card |
| `FileViewer.tsx` | ○ | Right-panel file preview |

### `apps/web/components/memory/`
| File | Status | Description |
|------|--------|-------------|
| `MemoryPanel.tsx` | ✓ (basic) | Memory list + delete |

### `apps/web/components/layout/`
| File | Status | Description |
|------|--------|-------------|
| `SessionSidebar.tsx` | ✓ (basic) | Session list + new session |
| `NotificationsPanel.tsx` | ○ | Notification bell + panel |
| `SettingsNav.tsx` | ○ | Settings page navigation |

### `apps/web/components/connectors/`
| File | Status | Description |
|------|--------|-------------|
| `ConnectorGrid.tsx` | ○ | Grid of available connectors |
| `ConnectorCard.tsx` | ○ | Individual connector with status |

### `apps/web/components/scheduled/`
| File | Status | Description |
|------|--------|-------------|
| `ScheduledTaskList.tsx` | ○ | List of active cron jobs |
| `ScheduledTaskCard.tsx` | ○ | Individual task with controls |

### `apps/web/lib/`
| File | Status | Description |
|------|--------|-------------|
| `types.ts` | ✓ | Shared TypeScript types |
| `api-client.ts` | ○ | Typed fetch wrapper for all API calls |
| `supabase.ts` | ○ | Supabase client singleton |
| `hooks/useSession.ts` | ○ | Auth session hook |
| `hooks/useNotifications.ts` | ○ | Notification polling hook |
| `hooks/useMemory.ts` | ○ | Memory CRUD hook |

---

## State Management

Currently: all state in `page.tsx` via `useState`. That works for the MVP but will become unwieldy. Recommended approach:

**Zustand** (lightweight, no boilerplate):

```typescript
// lib/store.ts
import { create } from 'zustand';
import type { Message, ToolActivity, Session } from './types';

interface ChatStore {
  messages: Message[];
  toolActivity: ToolActivity[];
  isStreaming: boolean;
  currentSessionId: string;
  pendingConfirmation: ConfirmActionEvent | null;
  pendingQuestion: AskUserQuestionEvent | null;

  addMessage: (msg: Message) => void;
  appendToMessage: (id: string, text: string) => void;
  addToolActivity: (activity: ToolActivity) => void;
  updateToolActivity: (toolName: string, status: string) => void;
  setPendingConfirmation: (event: ConfirmActionEvent | null) => void;
  setPendingQuestion: (event: AskUserQuestionEvent | null) => void;
}
```

This separates concerns cleanly and makes it easy to add the settings pages without prop drilling.

---

## What's Implemented vs What's Missing

### Implemented ✓
- Basic chat loop (send → SSE stream → display)
- Streaming text with markdown rendering
- Activity timeline (tool calls with icons and status)
- Session sidebar (list + new)
- Memory panel (list + delete)
- Dark theme, Tailwind CSS

### Missing ○ (priority order)

1. **Auth** (`/login`, `/signup`, `middleware.ts`) — nothing works without this in production
2. **ConfirmActionDialog** — agent can't get approval for destructive actions
3. **AskUserQuestionDialog** — agent can't ask clarifying questions
4. **FileCard + FileViewer** — agent-created files aren't surfaced to the user
5. **ModelSelector** — users can't choose their model
6. **NotificationsPanel** — scheduled task results never surface
7. **Connectors page** — users can't connect services
8. **Scheduled tasks page** — users can't manage their recurring tasks
9. **TodoList inline** — task progress isn't visible
10. **API client** (`lib/api-client.ts`) — all fetch calls are inlined in components
11. **Zustand store** — state management doesn't scale past the chat page
12. **ActivityTimeline collapsing** — long tasks flood the UI
