# Infinius — Personal vs Enterprise Tiers

This document covers what differs between a personal and enterprise deployment of Infinius, what's the same, and how to architect the differences.

---

## The Core Principle

**The agent engine is identical.** The agent loop, memory, tools, subagents, scheduler, and connectors all run the same code whether a single developer is using it locally or a 500-person company is using it on a private deployment. The differences between tiers are in **access control, limits, data isolation, and operational features** — not in the core AI capabilities.

This mirrors how Perplexity Computer works: the same underlying system serves individuals and enterprises. What changes is who can use it, how much they can use, how data is segregated, and what compliance/admin tooling wraps it.

---

## Side-by-Side Comparison

| Dimension | Personal | Enterprise |
|-----------|----------|------------|
| **Users** | Single user | Multiple users in an organization |
| **Identity** | Email + social login | SAML/OIDC SSO (Okta, Azure AD, Google Workspace) |
| **User provisioning** | Self-signup | SCIM directory sync, admin-managed |
| **Credit / usage model** | Per-user monthly allocation | Pooled org budget, per-team sub-allocations |
| **Usage visibility** | None (trust the system) | Admin dashboard: per-user, per-team, per-tool spend |
| **Memory scope** | Personal only | Personal + org-level shared memory (e.g. company facts, brand guidelines) |
| **Connector credentials** | Per-user OAuth tokens | Shared org credentials (e.g. one Slack workspace for all users) |
| **Data isolation** | Single-tenant by default | Strict per-org isolation, no cross-tenant data access |
| **Data retention** | Standard | Custom retention policies, right-to-delete workflows |
| **Training data** | May be used (depends on agreement) | Zero data retention for training (SOC 2, BAA available) |
| **Rate limits** | Standard (e.g. 10 concurrent tool calls) | Higher concurrency, longer max steps, burst allowances |
| **Model access** | Same frontier models | Same models + potentially private/fine-tuned model endpoints |
| **Skill library** | Built-in 50+ skills | Custom org skills (brand voice, internal processes, proprietary playbooks) |
| **Connector library** | 400+ public connectors | Same + custom internal connectors (internal APIs, proprietary tools) |
| **Admin controls** | None | Org settings, user management, policy enforcement |
| **Audit logging** | None | Every tool call, every model call logged with user/timestamp |
| **Support** | Self-serve | Dedicated support, SLAs, onboarding |
| **Deployment** | Cloud (shared) | Cloud (private tenant) or self-hosted on your own infra |

---

## What Does NOT Change

This is important: the following are architecturally identical between tiers.

- The agent loop (`AgentLoop`) — same code, same steps, same tool execution
- Memory system — same pgvector store, same semantic search, same auto-extraction
- All first-party tools — bash, browser, filesystem, search, etc.
- Subagent orchestration — same parallel spawning, same workspace sharing
- Scheduler — same BullMQ cron + delayed jobs
- Skill system — same markdown playbook loading
- The SSE streaming interface
- The UI components

Enterprise adds a layer *around* the engine. It doesn't replace the engine.

---

## Database Schema Differences

### Personal (current schema)

```sql
profiles         -- one row per user
sessions         -- one row per conversation
memories         -- one row per memory entry, scoped to user_id
connected_accounts -- one row per user × connector
```

### Enterprise additions

```sql
-- Organization table
CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  plan          text DEFAULT 'enterprise',
  credit_budget bigint,              -- total credits for the org
  settings      jsonb,              -- org-level config
  created_at    timestamptz DEFAULT now()
);

-- Link users to orgs (many-to-many for multi-org users)
CREATE TABLE org_memberships (
  org_id        uuid REFERENCES organizations(id),
  user_id       uuid REFERENCES profiles(id),
  role          text CHECK (role IN ('owner', 'admin', 'member')),
  team          text,               -- optional team/department
  PRIMARY KEY (org_id, user_id)
);

-- Org-level shared memory (brand guidelines, company facts, etc.)
CREATE TABLE org_memories (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        uuid REFERENCES organizations(id),
  category      text,
  content       text,
  embedding     vector(1536),
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now()
);

-- Org-level shared connector credentials
CREATE TABLE org_connected_accounts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        uuid REFERENCES organizations(id),
  source_id     text NOT NULL,
  -- same fields as connected_accounts
  UNIQUE(org_id, source_id)
);

-- Audit log: every tool call and model call
CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        uuid REFERENCES organizations(id),
  user_id       uuid REFERENCES profiles(id),
  session_id    uuid,
  event_type    text,              -- 'tool_call' | 'llm_call' | 'connector_call'
  tool_name     text,
  model_id      text,
  input_tokens  int,
  output_tokens int,
  cost_credits  int,
  created_at    timestamptz DEFAULT now()
);

-- Credit usage tracking
CREATE TABLE credit_usage (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        uuid REFERENCES organizations(id),
  user_id       uuid REFERENCES profiles(id),
  session_id    uuid,
  credits_used  int,
  period_start  timestamptz,
  period_end    timestamptz,
  created_at    timestamptz DEFAULT now()
);
```

---

## Memory Scope: Personal vs Org

### Personal memory (exists now)
User-scoped facts: "I'm a PM at Stripe", "I prefer bullet points."

### Org memory (enterprise addition)
Org-scoped facts injected into every user's context automatically:
- "Our company is Acme Corp, a B2B SaaS startup with 80 employees"
- "Our brand voice is direct, data-driven, no jargon"
- "Our primary CRM is HubSpot, project management is Linear"
- "When writing outreach, always reference the prospect's latest funding"

Org memories are managed by admins and shared with all org members. They're injected into `ContextBuilder.build()` alongside personal memories:

```typescript
// In ContextBuilder (enterprise version)
const [userFacts, orgFacts, relevantHistory] = await Promise.all([
  memoryClient.getUserFacts(userId),
  memoryClient.getOrgFacts(orgId),      // ← enterprise addition
  memoryClient.semanticSearch(userId, userMessage),
]);
```

### Custom org skills (enterprise addition)
Admins can upload custom skill playbooks:
- "Acme Corp brand voice guide"
- "Internal sales playbook"
- "Onboarding checklist skill"

These live in a `org_skills` table and are loaded the same way as built-in skills — the `SkillLoader` checks both the local filesystem and the database.

---

## Connector Differences

### Personal
- Each user connects their own accounts (their personal Gmail, their GitHub, etc.)
- Tokens stored in `connected_accounts` scoped to `user_id`

### Enterprise
Two connector types coexist:

**Shared org connectors** — one credential for the whole org:
- The company's Slack workspace (not each user's personal Slack)
- The company's HubSpot CRM instance
- The company's Jira project

Stored in `org_connected_accounts`, accessible to all org members.

**Personal connectors** — still per-user:
- Individual email accounts
- Personal GitHub accounts

The `ConnectorRegistry.buildConnectorTools()` method in enterprise merges both:

```typescript
async buildConnectorTools(userId: string, orgId?: string): Promise<RegisteredTool[]> {
  const [userTools, orgTools] = await Promise.all([
    this.buildUserConnectorTools(userId),
    orgId ? this.buildOrgConnectorTools(orgId) : Promise.resolve([]),
  ]);

  // Org tools take precedence for shared services (e.g. Slack)
  const toolMap = new Map<string, RegisteredTool>();
  [...userTools, ...orgTools].forEach(t => toolMap.set(t.name, t));
  return Array.from(toolMap.values());
}
```

---

## Rate Limits & Credit System

### Personal
Simple: one credit counter per user. Each LLM call and tool execution costs credits.

```typescript
interface UserCredits {
  userId: string;
  balance: number;
  resetAt: Date;     // monthly reset
}
```

Check before each agent turn:
```typescript
if (await credits.getBalance(userId) < MINIMUM_TURN_CREDITS) {
  throw new Error('Insufficient credits');
}
```

### Enterprise
More complex: org has a total budget, subdivided by team/user.

```typescript
interface OrgCreditConfig {
  orgId: string;
  totalBudget: number;
  teamAllocations: Record<string, number>;  // team → budget
  userOverrides: Record<string, number>;    // specific user overrides
  rollover: boolean;                        // unused credits carry over?
  alertThreshold: number;                   // alert admins at X% used
}
```

Credit deduction happens at the org level first, then checks user/team sub-limits.

---

## Audit Logging (Enterprise Only)

Every significant action is logged to `audit_log`. The agent loop emits events:

```typescript
// In AgentLoop.run() — enterprise wrapper
await auditLog.record({
  orgId, userId, sessionId,
  eventType: 'tool_call',
  toolName: tc.name,
  input: tc.input,  // ← careful: sanitize sensitive values
});
```

The audit log enables:
- Compliance reviews ("what did this user ask the agent to do last quarter?")
- Cost attribution ("which team is using the most credits?")
- Security investigations ("did anyone use the bash tool to exfiltrate data?")
- Usage reports for billing

---

## SSO / Identity (Enterprise Only)

Personal uses Supabase Auth (email + Google OAuth). Enterprise adds SAML/OIDC.

Recommended: [WorkOS](https://workos.com) or [Clerk](https://clerk.com) — both handle:
- SAML SSO (Okta, Azure AD, Google Workspace, etc.)
- SCIM directory sync (auto-provision/deprovision users)
- Admin-managed user roles

WorkOS integrates with Supabase Auth via custom auth providers. The resulting JWT looks the same — the agent code doesn't need to know how the user authenticated.

---

## Admin Dashboard (Enterprise Only)

A separate admin surface at `/admin`:

```
/admin/users          ← manage org members, roles, teams
/admin/usage          ← credit spend by user/team/tool/time
/admin/audit          ← full audit log with filters
/admin/connectors     ← manage org-level connector credentials
/admin/memory         ← manage org-level shared memories
/admin/skills         ← upload/manage custom org skills
/admin/settings       ← org-wide settings, SSO config, retention policies
```

This is a significant build. Start with `/admin/usage` (most requested) and `/admin/users`.

---

## Self-Hosting (Enterprise)

For enterprises that cannot use cloud infrastructure:

1. **Database**: Self-hosted PostgreSQL + pgvector (or Neon for managed Postgres)
2. **Auth**: Keycloak or Authentik for self-hosted SSO
3. **Redis**: Self-hosted Redis or Valkey
4. **Storage**: MinIO (S3-compatible) instead of Supabase Storage
5. **Browser**: Self-hosted Playwright pool or Browserless
6. **Deployment**: Kubernetes (Helm charts) or Docker Compose for on-prem

The codebase is already structured so each of these can be swapped — they're all environment variables, not hard-coded services.

---

## Implementation Roadmap for Enterprise Features

Priority order for building out enterprise support:

1. **Organizations table + memberships** — foundation for everything else (1 day)
2. **Credit tracking** — personal first, then org budgeting (1-2 days)
3. **Audit logging** — emit from agent loop, store in DB (1 day)
4. **Org memory** — extend ContextBuilder to merge org + user facts (0.5 days)
5. **Org connector credentials** — extend ConnectorRegistry (0.5 days)
6. **Admin dashboard** — usage page first (2-3 days)
7. **SSO integration** — WorkOS (1-2 days)
8. **SCIM provisioning** — WorkOS handles most of it (0.5 days)
9. **Custom skills** — DB-backed skill storage (1 day)
10. **Self-hosting guide** — documentation + Helm charts (1-2 days)

Total: ~2-3 weeks of focused work to reach a launchable enterprise tier.
