/**
 * Memory Client
 *
 * 1:1 mirror of Computer's memory system:
 *
 * WRITE PATH (auto-learning):
 *   After every agent turn, extract durable facts from the conversation.
 *   Embed them with text-embedding-3-small, upsert into pgvector.
 *   Categories: identity, preferences, projects, history, corrections.
 *
 * READ PATH (semantic recall):
 *   At turn start, run parallel semantic queries against the store.
 *   Inject top-K results into the system prompt.
 *   Also fetch all "identity" facts unconditionally (always in context).
 *
 * DEDUPLICATION:
 *   Before upserting, check cosine similarity — skip if > 0.95 match exists.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export type MemoryCategory =
  | 'identity'      // name, role, company, team
  | 'preferences'   // style, formatting, tool habits
  | 'projects'      // active work, goals, deadlines
  | 'history'       // key exchanges and decisions
  | 'corrections';  // user corrections to agent behaviour

export interface MemoryEntry {
  id: string;
  userId: string;
  category: MemoryCategory;
  content: string;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
}

export interface SearchOptions {
  limit?: number;
  category?: MemoryCategory;
  threshold?: number; // cosine similarity minimum (0–1)
}

export class MemoryClient {
  private supabase: SupabaseClient;
  private openai: OpenAI;
  private embeddingModel = 'text-embedding-3-small';

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // ── Write Path ──────────────────────────────────────────────

  /**
   * Store a durable fact. Embeds the content and upserts into pgvector.
   * Skips if a near-duplicate already exists (cosine sim > 0.95).
   */
  async remember(
    userId: string,
    category: MemoryCategory,
    content: string,
    sessionId?: string,
  ): Promise<MemoryEntry | null> {
    const embedding = await this.embed(content);

    // Check for near-duplicates
    const { data: similar } = await this.supabase.rpc('match_memories', {
      p_user_id: userId,
      p_embedding: embedding,
      p_threshold: 0.95,
      p_limit: 1,
    });

    if (similar && similar.length > 0) {
      return null; // already known
    }

    const { data, error } = await this.supabase
      .from('memories')
      .insert({
        user_id: userId,
        category,
        content,
        embedding,
        session_id: sessionId,
      })
      .select()
      .single();

    if (error) throw new Error(`Memory write failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Auto-extract and store facts from a completed conversation turn.
   * Uses a fast LLM pass to identify durable facts worth remembering.
   */
  async extractAndStore(
    userId: string,
    sessionId: string,
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    const extraction = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extract durable facts about the user from this conversation exchange.
Return a JSON array of objects with { category, content } where category is one of:
identity, preferences, projects, history, corrections.

Only extract facts that are clearly stated and worth remembering long-term.
Do NOT extract ephemeral instructions like "make this shorter".
Return [] if nothing worth remembering was said.

Example output:
[
  { "category": "identity", "content": "The user works as a Senior PM at Acme Corp" },
  { "category": "projects", "content": "The user is building a marketplace app called WhipGuides" }
]`,
        },
        {
          role: 'user',
          content: `User: ${userMessage}\n\nAssistant: ${assistantResponse}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    let facts: Array<{ category: MemoryCategory; content: string }> = [];
    try {
      const parsed = JSON.parse(extraction.choices[0].message.content ?? '{}');
      facts = parsed.facts ?? parsed.items ?? (Array.isArray(parsed) ? parsed : []);
    } catch {
      return; // malformed JSON — skip silently
    }

    await Promise.all(
      facts.map(f => this.remember(userId, f.category, f.content, sessionId)),
    );
  }

  // ── Read Path ───────────────────────────────────────────────

  /**
   * Semantic search over the user's memory store.
   * Returns top-K entries ranked by cosine similarity.
   */
  async semanticSearch(
    userId: string,
    query: string,
    opts: SearchOptions = {},
  ): Promise<MemoryEntry[]> {
    const { limit = 10, category, threshold = 0.70 } = opts;

    const embedding = await this.embed(query);

    const { data, error } = await this.supabase.rpc('match_memories', {
      p_user_id: userId,
      p_embedding: embedding,
      p_threshold: threshold,
      p_limit: limit,
      p_category: category ?? null,
    });

    if (error) throw new Error(`Memory search failed: ${error.message}`);
    return (data ?? []).map(this.mapRow);
  }

  /**
   * Fetch all identity facts for a user (always injected into context).
   */
  async getUserFacts(userId: string): Promise<MemoryEntry[]> {
    const { data, error } = await this.supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .eq('category', 'identity')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) throw new Error(`Get user facts failed: ${error.message}`);
    return (data ?? []).map(this.mapRow);
  }

  /**
   * Run multiple semantic searches in parallel (same pattern Computer uses).
   */
  async multiSearch(
    userId: string,
    queries: string[],
    opts: SearchOptions = {},
  ): Promise<MemoryEntry[]> {
    const results = await Promise.all(
      queries.map(q => this.semanticSearch(userId, q, opts)),
    );

    // Deduplicate by id
    const seen = new Set<string>();
    return results.flat().filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  /**
   * Delete a memory entry (user-initiated forgetting).
   */
  async forget(userId: string, memoryId: string): Promise<void> {
    const { error } = await this.supabase
      .from('memories')
      .delete()
      .eq('id', memoryId)
      .eq('user_id', userId);

    if (error) throw new Error(`Memory delete failed: ${error.message}`);
  }

  /**
   * List all memories for a user (for the memory panel UI).
   */
  async listAll(userId: string): Promise<MemoryEntry[]> {
    const { data, error } = await this.supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`Memory list failed: ${error.message}`);
    return (data ?? []).map(this.mapRow);
  }

  // ── Session History ─────────────────────────────────────────

  async saveMessage(
    sessionId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    await this.supabase.from('session_messages').insert({
      session_id: sessionId,
      user_id: userId,
      role,
      content,
    });
  }

  async getSessionHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    const { data, error } = await this.supabase
      .from('session_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Session history failed: ${error.message}`);
    return data ?? [];
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async embed(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text.slice(0, 8192), // token limit guard
    });
    return response.data[0].embedding;
  }

  private mapRow(row: Record<string, unknown>): MemoryEntry {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      category: row.category as MemoryCategory,
      content: row.content as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      sessionId: row.session_id as string | undefined,
    };
  }
}
