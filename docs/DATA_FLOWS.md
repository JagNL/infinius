# Infinius — Data Flows

Step-by-step traces of every major lifecycle in the system.

---

## 1. A Full Agent Turn (happy path)

**Scenario**: User sends "Research the top 5 AI coding tools and compare them"

```
Browser                  apps/web          apps/api           packages/
────────────────────────────────────────────────────────────────────────

User types message
and hits send
     │
     ▼
ChatInput.onSend()
     │
     ├── optimistically append user message to state
     ├── append empty assistant placeholder
     └── POST /api/chat
           { message, sessionId, modelId }
                          │
                          ▼
                    chat.ts route
                          │
                          ├── validate JWT via Supabase
                          ├── create workspacePath
                          │   /tmp/.../userId/sessionId/
                          │
                          ├── getSessionHistory(sessionId)
                          │   → load prior messages from DB
                          │
                          ├── ContextBuilder.build()
                          │   ├── getUserFacts(userId)    ← always-on
                          │   └── semanticSearch(userId,  ← top-5 relevant
                          │         userMessage)           memories
                          │   → returns system prompt string
                          │
                          ├── buildDefaultRegistry()      ← 15 first-party tools
                          ├── connectorRegistry           ← user's connected tools
                          │     .buildConnectorTools()
                          │   → merged tool list
                          │
                          ├── set SSE headers
                          └── AgentLoop.run()
                                    │
                         ┌──────────┘
                         │
                 STEP 1: llm.complete(
                           messages=[system, user],
                           tools=[all 20+ tools]
                         )
                         │
                         Claude responds:
                         "I'll research these tools in parallel"
                         tool_calls: [
                           search_web({ queries: ["Cursor AI coding", "GitHub Copilot features"] }),
                           search_web({ queries: ["Tabnine review", "Codeium comparison"] }),
                           search_web({ queries: ["Amazon CodeWhisperer 2026"] }),
                         ]
                         │
                         ├── execute 3 search_web calls in parallel
                         │   (Promise.all)
                         │   → Brave API called 3 times simultaneously
                         │   → results returned
                         │
                         ├── onToolStart fired → SSE: tool_activity event
                         │   ────────────────────────────────────────────────►
                         │   { type: 'tool_activity', toolName: 'search_web',
                         │     description: 'Searching the web for...' }
                         │   ◄──── ActivityTimeline shows spinning indicator
                         │
                         ├── tool results appended to messages
                         │
                 STEP 2: llm.complete(
                           messages=[system, user, assistant, tool×3],
                           tools=[...]
                         )
                         │
                         Claude responds:
                         "Now let me fetch the full pages for each"
                         tool_calls: [
                           fetch_url({ url: "https://cursor.sh" }),
                           fetch_url({ url: "https://github.com/features/copilot" }),
                           ...
                         ]
                         │
                         ├── execute 5 fetch_url calls in parallel
                         │   → SSE: tool_activity events for each
                         │
                 STEP 3: llm.complete(all messages so far)
                         │
                         Claude has enough data, generates final response:
                         "Here's a comparison of the top 5 AI coding tools..."
                         stopReason: 'end_turn'
                         │
                         ├── onTextChunk fired for each text segment
                         │   ────────────────────────────────────────────────►
                         │   { type: 'text_delta', text: 'Here\'s a comparison...' }
                         │   ◄──── MessageList appends to assistant placeholder
                         │
                         └── loop exits (end_turn)

                          │
                          ├── saveMessage(sessionId, 'user', message)
                          ├── saveMessage(sessionId, 'assistant', finalText)
                          ├── extractAndStore(userId, sessionId,
                          │     userMessage, assistantResponse)
                          │   → GPT-4o-mini extracts facts
                          │   → embed + upsert to pgvector
                          │
                          └── SSE: { type: 'done', steps: 3 }
                              ────────────────────────────────────────────────►

     ◄── SSE stream closes
     setIsStreaming(false)
     final message rendered in markdown
```

---

## 2. Memory Write Cycle

**Scenario**: User says "I'm a senior engineer at Stripe"

```
After agent turn completes:

extractAndStore(userId, sessionId,
  userMessage: "I'm a senior engineer at Stripe",
  assistantResponse: "Got it! I'll remember that..."
)
     │
     ▼
GPT-4o-mini prompt:
  "Extract durable facts from this exchange..."
     │
     ▼
Response: [
  { category: "identity", content: "The user is a senior engineer at Stripe" }
]
     │
     ▼
For each fact:
  ├── openai.embeddings.create(content)
  │   → vector: [0.023, -0.142, 0.891, ...] (1536 dimensions)
  │
  └── supabase.rpc('match_memories', {
        p_user_id: userId,
        p_embedding: vector,
        p_threshold: 0.95,  ← dedup threshold
        p_limit: 1
      })
        │
        ├── Result: [] (no similar memory exists)
        │
        └── supabase.from('memories').insert({
              user_id: userId,
              category: 'identity',
              content: "The user is a senior engineer at Stripe",
              embedding: vector,
              session_id: sessionId
            })
```

**Next turn** — the context builder runs:

```
getUserFacts(userId)
  → SELECT * FROM memories WHERE user_id = ? AND category = 'identity'
  → Returns: ["The user is a senior engineer at Stripe"]
  → Injected into system prompt unconditionally

semanticSearch(userId, "help me debug this code")
  → embed("help me debug this code")
  → pgvector cosine search
  → Returns: ["The user is a senior engineer at Stripe", ...]
  → Injected into <relevant_memory> block
```

---

## 3. Subagent Lifecycle

**Scenario**: "Research 3 competitors and compare them"

```
Parent AgentLoop
     │
     ▼
LLM decides to spawn subagents:
tool_call: run_subagent({
  objective: "Research Competitor A: funding, CEO, main products",
  task_name: "Research Competitor A",
  subagent_type: "research"
})
tool_call: run_subagent({
  objective: "Research Competitor B: ...",
  ...
})
tool_call: run_subagent({
  objective: "Research Competitor C: ...",
  ...
})

     │  (all 3 run_subagent calls execute in parallel via Promise.all)
     │
     ▼
SubagentOrchestrator.spawn() × 3 (simultaneous)

Each subagent:
  ├── mkdir workspacePath/subagents/sub-001/
  ├── ContextBuilder.build()  ← fresh context, no parent history
  ├── AgentLoop.run()
  │     └── LLM calls search_web, fetch_url
  │         writes findings to competitor-a-research.md
  └── returns SubagentResult {
        filesCreated: ['subagents/sub-001/competitor-a-research.md'],
        output: "Summary of findings...",
        steps: 4
      }

     │  (all 3 complete, results returned to parent)
     │
     ▼
Parent AgentLoop continues:
  ├── reads result summaries
  ├── can also read_file('subagents/sub-001/competitor-a-research.md')
  └── LLM synthesises: "Here's a comparison table..."
```

---

## 4. Scheduled Task Lifecycle

**Scenario**: "Check my inbox for investor replies every hour"

```
User message in chat
     │
     ▼
AgentLoop LLM decides:
tool_call: schedule_cron({
  action: 'create',
  name: 'Hourly inbox check',
  task: 'Check Gmail inbox for emails from investors or VCs.
         If any found, send a notification.',
  cron: '0 * * * *',   ← every hour at :00
  user_description: 'Setting up hourly inbox check'
})

     │
     ▼
Scheduler.createCron()
  → BullMQ.upsertJobScheduler('cron-id', { pattern: '0 * * * *' }, jobData)
  → stored in Redis

     │  (1 hour passes)
     │
     ▼
BullMQ fires job
Worker.processJob()
  ├── AgentLoop.run() with task as the prompt
  ├── LLM calls call_external_tool({ source_id: 'gmail', tool: 'search_email', ... })
  │     → fetches Gmail
  │
  ├── Case A: No new investor emails
  │     └── AgentLoop ends silently (no notification sent)
  │
  └── Case B: New email from "Sequoia Capital"
        └── LLM calls send_notification({
              title: 'New investor email',
              body: 'Email from Sequoia Capital: "Following up on your deck..."',
              url: 'https://mail.google.com/...'
            })
              → INSERT into notifications table
              → WebSocket/SSE pushes to connected client
              → User sees notification badge in UI
```

---

## 5. OAuth Connector Flow

**Scenario**: User wants to connect Slack

```
UI: Settings → Connectors → Slack → "Connect"
     │
     ▼
POST /api/connectors/slack/connect
     │
     ▼
ConnectorRegistry.getOAuthUrl(userId, 'slack', redirectUri)
  │
  ├── If Pipedream configured:
  │     POST https://api.pipedream.com/v1/connect/tokens
  │     → returns { connect_link_url: "https://connect.pipedream.com/..." }
  │
  └── If custom OAuth:
        → build OAuth URL for Slack API
     │
     ▼
API returns: { authUrl: "https://..." }
     │
     ▼
Browser redirects to authUrl
User authorizes Slack in Slack's UI
Slack redirects back to:
  GET /api/connectors/callback?code=abc&state=xyz

     │
     ▼
Exchange code for tokens
ConnectorRegistry.saveAccount({
  userId, sourceId: 'slack',
  accountId: 'T1234567',
  accessToken: 'xoxb-...',
  ...
})
  → INSERT into connected_accounts

     │
     ▼
Next agent turn:
buildConnectorTools(userId)
  ├── SELECT source_id FROM connected_accounts WHERE user_id = ?
  │   → ['slack']
  │
  └── For Slack connector tools (send_message, search_messages):
        create RegisteredTool with execute() that calls Slack API
        using stored access token

Agent now has Slack tools available automatically.
```

---

## 6. File Share Flow

**Scenario**: Agent creates a PDF report and shares it with the user

```
Agent calls write_file({
  file_path: 'quarterly-report.pdf',
  content: '<binary pdf data>'
})
  → written to workspacePath/quarterly-report.pdf

     │
     ▼
Agent calls share_file (TODO: implement)
  ├── Upload to Supabase Storage
  │   → returns public URL
  │
  └── INSERT into workspace_files {
        session_id, user_id,
        filename: 'quarterly-report.pdf',
        storage_url: 'https://...',
        mime_type: 'application/pdf'
      }
     │
     ▼
SSE event: { type: 'file_shared', fileId, filename, url }
     │
     ▼
UI renders download button / file preview inline
```

---

## 7. confirm_action Flow

**Scenario**: Agent is about to send an email and needs user approval

```
AgentLoop calls confirm_action({
  action: 'send email',
  question: 'Send this email to john@acme.com?',
  placeholder: 'Subject: Q4 Review\n\nHi John...'
})
     │
     ▼
Tool execute():
  → INSERT into pending_confirmations (TODO: implement table)
  → SSE event: { type: 'confirm_action', action, question, placeholder, confirmationId }

     │
     ▼
UI renders confirmation dialog with full draft
User clicks Approve or Deny

     │  (Approve)
     ▼
POST /api/confirmations/:id/approve
  → UPDATE pending_confirmations SET status = 'approved'
  → Signal to waiting AgentLoop via Redis pub/sub

     │
     ▼
AgentLoop receives approval signal
  → continues with the next LLM turn
  → LLM calls send_email({...})
```
