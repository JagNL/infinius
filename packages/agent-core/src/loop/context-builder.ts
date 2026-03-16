/**
 * Context Builder
 *
 * Before every agent turn, assembles the full system prompt by combining:
 *  1. Base system prompt (agent identity, capabilities, rules)
 *  2. Memory injection (user facts + relevant past context retrieved via semantic search)
 *  3. Loaded skills (markdown playbooks injected for the current task)
 *  4. Current date/time and session metadata
 *
 * This is the "pre-flight" step Computer runs before calling the LLM.
 */

import type { MemoryClient } from '@infinius/memory';

export interface ContextBuilderOptions {
  userId: string;
  sessionId: string;
  /** The user's latest message — used to query relevant memories */
  userMessage: string;
  /** Skill playbooks to inject (loaded markdown files) */
  loadedSkills?: string[];
  memoryClient: MemoryClient;
}

const BASE_SYSTEM_PROMPT = `
You are Infinius, an autonomous AI agent. You have access to a rich set of tools and can
complete complex, multi-step tasks on behalf of the user. You persist until the job is done.

Core principles:
- Use tools proactively — don't ask the user to do things you can do yourself
- Execute work in parallel whenever possible (spawn subagents, run tools concurrently)
- Keep the user informed through the activity timeline, not constant chat messages
- Remember durable facts about the user and use them to personalise every interaction
- When blocked, try alternative approaches before asking the user for help

Capabilities you have access to:
- Web search (Brave, Tavily) and deep page reading
- Cloud browser automation (Playwright) for any website
- Code execution in a sandboxed Linux environment (Python, Node.js, shell)
- File system operations (read, write, edit, search files in your workspace)
- Memory (semantic search over user facts and conversation history)
- Subagent orchestration (spawn parallel agents with shared workspace)
- Scheduling (cron jobs, delayed actions, push notifications)
- 400+ external connectors via OAuth (Slack, Gmail, Notion, GitHub, etc.)
- Document creation (DOCX, PPTX, XLSX, PDF)
- Media generation (images, video, text-to-speech)
- Website building and deployment

Always prefer doing over asking. Always cite your sources.
`.trim();

export class ContextBuilder {
  async build(opts: ContextBuilderOptions): Promise<string> {
    const { userId, sessionId, userMessage, loadedSkills = [], memoryClient } = opts;

    const parts: string[] = [BASE_SYSTEM_PROMPT];

    // ── 1. Inject time / session context ──────────────────────
    parts.push(`\n<session>\nSession ID: ${sessionId}\nCurrent time: ${new Date().toUTCString()}\nUser ID: ${userId}\n</session>`);

    // ── 2. Memory injection ────────────────────────────────────
    // Computer does this: retrieve user facts + relevant past context
    const [userFacts, relevantHistory] = await Promise.all([
      memoryClient.getUserFacts(userId),
      memoryClient.semanticSearch(userId, userMessage, { limit: 5 }),
    ]);

    if (userFacts.length > 0) {
      const factsText = userFacts.map(f => `- ${f.content}`).join('\n');
      parts.push(`\n<user_background>\nFacts about this user:\n${factsText}\n</user_background>`);
    }

    if (relevantHistory.length > 0) {
      const historyText = relevantHistory.map(m => `- ${m.content} (${m.createdAt})`).join('\n');
      parts.push(`\n<relevant_memory>\nRelevant past context:\n${historyText}\n</relevant_memory>`);
    }

    // ── 3. Loaded skills ───────────────────────────────────────
    if (loadedSkills.length > 0) {
      for (const skill of loadedSkills) {
        parts.push(`\n<skill>\n${skill}\n</skill>`);
      }
    }

    return parts.join('\n');
  }
}
