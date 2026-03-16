# Infinius — Tool Reference

Every first-party tool available to the agent. Tools are the agent's hands — this is the complete catalogue.

---

## Research Tools

### `search_web`

Search the web for current, publicly available information.

| Field | Value |
|-------|-------|
| **Category** | research |
| **Backend** | Brave Search API (primary), Tavily (fallback) |
| **Visible in timeline** | Yes |

**Input**
```typescript
{
  queries: string[]  // max 3 queries, run in parallel
}
```

**Output**
```typescript
Array<{
  title: string;
  url: string;
  description: string;
}>
```

**When to use**: Current news, prices, company info, publicly available facts.
**When NOT to use**: Login-gated content, JavaScript-heavy pages → use `browser_task` instead.

---

### `fetch_url`

Read the full content of a specific URL.

| Field | Value |
|-------|-------|
| **Category** | research |
| **Backend** | Tavily Extract API (if configured), axios fallback |
| **Visible in timeline** | Yes |

**Input**
```typescript
{
  url: string;
  prompt?: string;  // optional: extract specific info from the page
}
```

**Output**
```typescript
{
  url: string;
  content: string;  // up to 40,000 characters of page content
  prompt?: string;
}
```

**When to use**: Reading a specific article, documentation page, or any publicly accessible URL.

---

### `search_vertical`

Search specialised content verticals.

| Field | Value |
|-------|-------|
| **Category** | research |
| **Backends** | Semantic Scholar (academic), Serper Images, LinkedIn (people), YouTube Data API |
| **Visible in timeline** | Yes |

**Input**
```typescript
{
  vertical: 'academic' | 'people' | 'image' | 'video' | 'shopping';
  query: string;  // 2-5 word search query
}
```

**When to use**: Research papers (`academic`), finding professionals (`people`), stock photos (`image`), tutorials (`video`), product prices (`shopping`).

---

## Browser Tools

### `browser_task`

Run a full browser automation task using Playwright.

| Field | Value |
|-------|-------|
| **Category** | browser |
| **Backend** | Playwright (headless Chromium). Set `BROWSER_WS_ENDPOINT` for cloud |
| **Visible in timeline** | Yes |
| **Cost** | Higher — launches a browser process |

**Input**
```typescript
{
  url: string;           // starting URL
  task: string;          // full instructions — no conversation history available
  user_description: string;
  output_schema?: object; // optional JSON Schema for structured extraction
}
```

**Output**
```typescript
{
  url: string;
  title: string;
  content: string;  // page text, up to 20,000 characters
  task_completed: boolean;
}
```

**When to use**: Sites requiring login, JavaScript-rendered content, form submission, multi-step flows.
**Note**: The browser agent has no conversation history — include all context in `task`.

---

### `screenshot_page`

Take a full-page screenshot of a URL.

| Field | Value |
|-------|-------|
| **Category** | browser |
| **Output** | PNG saved to workspace |

**Input**
```typescript
{
  url: string;
  user_description: string;
}
```

**Output**
```typescript
{
  file_path: string;  // absolute path to the saved PNG
  filename: string;
}
```

---

## Code Execution

### `bash`

Execute shell commands in the agent's sandboxed workspace.

| Field | Value |
|-------|-------|
| **Category** | code |
| **Working directory** | session workspace |
| **Pre-installed** | Python, Node.js, ffmpeg, yt-dlp, curl, standard Unix tools |
| **Visible in timeline** | Yes |
| **Default timeout** | 30 seconds |
| **Max timeout** | 600 seconds (10 minutes) |

**Input**
```typescript
{
  command: string;
  timeout?: number;           // milliseconds, default 30000
  user_description: string;   // shown in activity timeline
}
```

**Output**
```typescript
{
  stdout: string;   // up to 50,000 characters
  stderr: string;   // up to 10,000 characters
  exit_code: number;
}
```

**Common uses**:
```bash
# Install a Python package and run a script
pip install pandas && python analyze.py

# Download a YouTube video
yt-dlp -o output.mp4 https://youtube.com/...

# Convert video format
ffmpeg -i input.mp4 -c:v libx264 output.mp4

# Make an API call
curl -s https://api.example.com/data | python -m json.tool
```

**Security note**: In development, this runs as a child process. For production with untrusted users, replace with E2B or Modal sandbox.

---

## Filesystem Tools

All filesystem tools operate within the session's workspace directory. Absolute paths outside the workspace are blocked.

### `read_file`

Read a file from the workspace.

**Input**
```typescript
{
  file_path: string;    // relative to workspace
  offset?: number;      // line number to start from (default: 0)
  limit?: number;       // max lines to return (default: 2000)
}
```

**Output**
```typescript
{
  content: string;
  total_lines: number;
}
```

---

### `write_file`

Create or overwrite a file in the workspace.

**Input**
```typescript
{
  file_path: string;
  content: string;
}
```

**Output**
```typescript
{
  written: boolean;
  path: string;
  size_bytes: number;
}
```

---

### `edit_file`

Make exact string replacements in a file. Fails if `old_string` is not found (prevents silent errors).

**Input**
```typescript
{
  file_path: string;
  old_string: string;     // must be unique in the file (unless replace_all: true)
  new_string: string;
  replace_all?: boolean;  // default: false
}
```

**Output**
```typescript
{
  file_path: string;
  replaced: boolean;
}
```

**Best practice**: Use unique surrounding context in `old_string` to ensure the right occurrence is replaced.

---

### `glob_files`

Find files matching a pattern in the workspace.

**Input**
```typescript
{
  pattern: string;  // glob pattern e.g. '**/*.ts', 'data/*.csv'
}
```

**Output**
```typescript
{
  files: string[];
}
```

---

### `grep_files`

Search file contents for a regex pattern.

**Input**
```typescript
{
  pattern: string;       // regex pattern
  glob?: string;         // filter files (default: '**/*')
  ignore_case?: boolean; // default: false
}
```

**Output**
```typescript
{
  matches: Array<{
    file: string;
    line: number;
    content: string;
  }>;
}
```

---

## Memory Tools

### `memory_search`

Search the user's memory for personal facts and past context.

**Input**
```typescript
{
  queries: string[];        // natural language questions, run in parallel
  user_description: string;
}
```

**Output**
```typescript
{
  memories: Array<{
    id: string;
    category: 'identity' | 'preferences' | 'projects' | 'history' | 'corrections';
    content: string;
    date: string;
  }>;
}
```

**When to use**: Start of a session when you want to retrieve context about the user before doing work. Computer calls this proactively at the beginning of tasks where user context matters.

---

### `memory_update`

Store a durable fact about the user.

**Input**
```typescript
{
  content: string;          // "Remember that I prefer..." format
  user_description: string;
}
```

**When to use**: Any time the user reveals a durable fact — name, role, project, preference, correction. Do not store ephemeral instructions.

---

## Orchestration Tools

### `run_subagent`

Spawn a child agent to handle a complex subtask.

| Field | Value |
|-------|-------|
| **Category** | orchestration |
| **Shares workspace** | Yes — subagent writes to `workspace/subagents/<id>/` |
| **Can spawn subagents** | No — depth capped at 1 |

**Input**
```typescript
{
  objective: string;      // full task description — subagent has no conversation history
  task_name: string;      // short label e.g. "Research Acme Corp"
  user_description: string;
  subagent_type: 'research' | 'coding' | 'asset' | 'website_building' | 'general_purpose';
  model?: string;         // 'claude_sonnet' | 'gpt_4o' | 'gpt_4o_mini' | 'gemini_pro'
}
```

**Output**
```typescript
{
  subagent_id: string;
  output: string;           // subagent's final text response
  files_created: string[];  // files written to workspace
  steps: number;
}
```

**Best practice**: For large data inputs (entity lists, datasets), save them to a workspace file first and reference the path in `objective`. Do not inline large datasets.

---

### `load_skill`

Load a skill playbook into the agent's context.

**Input**
```typescript
{
  name: string;  // e.g. 'research-assistant', 'office/pptx', 'marketing/content-creation'
}
```

**Output**
```typescript
{
  skill: string;    // skill name
  content: string;  // full markdown content of the skill
}
```

---

## Scheduling Tools

### `schedule_cron`

Create, list, update, or delete recurring scheduled tasks.

**Input**
```typescript
{
  action: 'create' | 'update' | 'list' | 'delete';
  cron_id?: string;          // required for update/delete
  name?: string;             // required for create
  task?: string;             // required for create — what the agent will do when triggered
  cron?: string;             // required for create — UTC cron expression
  exact?: boolean;           // run at exact time (no jitter)
  user_description: string;
}
```

**Cron expression examples**:
```
0 9 * * *       → daily at 9am UTC
0 9 * * 1       → every Monday at 9am UTC
0 */2 * * *     → every 2 hours
0 9,17 * * 1-5  → 9am and 5pm on weekdays
```

**Important**: Minimum frequency is 1 hour. Never call this "a cron job" to users — use "recurring task" or "scheduled task".

---

### `pause_and_wait`

Pause the current workflow for a specified time, then resume.

**Input**
```typescript
{
  wait_minutes: number;   // how long to wait
  reason: string;         // internal — why we're waiting
  next_steps: string;     // what to do when resuming (becomes the next prompt)
  ai_response: string;    // message to show the user while waiting
  metadata?: object;      // any context to preserve across the pause
}
```

**Common use cases**:
- Rate limit hit → `wait_minutes: 60`
- Waiting for email reply → `wait_minutes: 240`
- One-time scheduled action → calculate minutes until target time

**Note**: Use Python to calculate `wait_minutes` for future times — never do date math mentally.

---

## Notification Tools

### `send_notification`

Send an in-app notification to the user.

**Input**
```typescript
{
  title: string;
  body: string;                 // enough detail to understand without opening the app
  url?: string;                 // optional relevant link
  schedule_description?: string; // e.g. "Checking hourly", "Daily · 9am"
}
```

**When to use**: Only when a scheduled task finds genuinely new or noteworthy information. Do NOT send notifications when nothing changed.

---

### `confirm_action`

Request user confirmation before an irreversible action.

**Input**
```typescript
{
  action: string;       // short label e.g. "send email"
  question: string;     // confirmation question
  placeholder?: string; // full draft content for review
}
```

**Required before**: sending emails, posting messages, making purchases, deleting data, publishing content.
**Not required when**: user explicitly said "just do it" or "don't ask for confirmation."

---

### `submit_answer`

Submit the final answer to the user (terminal tool).

**Input**
```typescript
{
  answer: string;  // markdown-formatted final response
}
```

---

## Connector Tools

### `list_external_tools`

List available OAuth integrations and their connection status.

**Input**
```typescript
{
  queries?: string[];       // optional: filter by keyword
  user_description: string;
}
```

**Output**
```typescript
{
  connectors: Array<{
    sourceId: string;
    name: string;
    description: string;
    status: 'CONNECTED' | 'DISCONNECTED' | 'QUOTA_EXHAUSTED';
    tools: Array<{ name: string; description: string }>;
  }>;
}
```

**Important**: Always call this before saying you cannot access a service. Never assume a connector is unavailable without checking.

---

### `call_external_tool`

Execute a tool on a connected external service.

**Input**
```typescript
{
  source_id: string;             // e.g. 'gmail', 'slack', 'notion'
  tool_name: string;             // exact name from list_external_tools
  arguments: Record<string, unknown>;
  user_description: string;
}
```

**Output**: depends on the specific connector tool.

**Pattern**: Always call `list_external_tools` first → then `call_external_tool` with the exact `source_id` and `tool_name` from the results.
