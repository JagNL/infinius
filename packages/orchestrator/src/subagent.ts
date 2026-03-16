/**
 * Subagent Orchestrator
 *
 * Computer spawns subagents to:
 * - Divide and conquer large research tasks (1 subagent per company/topic)
 * - Generate multiple assets in parallel (1 subagent per document)
 * - Chain work (subagent 1 collects data → saves to file → subagent 2 builds on it)
 *
 * Key design decisions that mirror Computer:
 * 1. Subagents share the same workspace filesystem as the parent
 * 2. Subagents each get their own context window (prevent parent context overflow)
 * 3. Each subagent can use a different model (cost/quality routing)
 * 4. Parent waits for all parallel subagents then synthesises results
 * 5. Subagents cannot spawn further subagents (prevent infinite recursion)
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { AgentLoop } from '@infinius/agent-core';
import type { LLMMessage, ModelConfig } from '@infinius/agent-core';
import { ContextBuilder } from '@infinius/agent-core';
import { MemoryClient } from '@infinius/memory';
import { buildDefaultRegistry } from '@infinius/tools';

export type SubagentType = 'research' | 'coding' | 'asset' | 'website_building' | 'general_purpose';

export interface SubagentSpawnOptions {
  /** Unique ID for this subagent instance */
  subagentId: string;
  /** Parent session context */
  parentSessionId: string;
  parentUserId: string;
  /** Shared workspace (same as parent — subagents read/write here) */
  workspacePath: string;
  /** What this subagent should accomplish */
  objective: string;
  /** Human-readable task name shown in the UI */
  taskName: string;
  /** User-facing description shown in activity timeline */
  userDescription: string;
  /** Which model to use for this subagent */
  modelConfig?: ModelConfig;
  /** Skills to preload into context */
  preloadSkills?: string[];
  /** Whether this subagent can access memory */
  allowMemory?: boolean;
}

export interface SubagentResult {
  subagentId: string;
  taskName: string;
  success: boolean;
  output: string;
  filesCreated: string[];
  error?: string;
  steps: number;
}

const DEFAULT_SUBAGENT_MODEL: ModelConfig = {
  modelId: 'claude-3-5-sonnet-20241022',
  provider: 'anthropic',
  maxTokens: 8096,
};

export class SubagentOrchestrator {
  private agentLoop = new AgentLoop();
  private contextBuilder = new ContextBuilder();
  private memoryClient = new MemoryClient();

  /**
   * Spawn a single subagent and await its result.
   */
  async spawn(opts: SubagentSpawnOptions): Promise<SubagentResult> {
    const {
      subagentId, parentSessionId, parentUserId,
      workspacePath, objective, taskName,
      modelConfig = DEFAULT_SUBAGENT_MODEL,
      preloadSkills = [],
      allowMemory = false,
    } = opts;

    // Subagents get a subdirectory of the shared workspace
    // so they can write files without naming conflicts
    const subagentWorkspace = path.join(workspacePath, 'subagents', subagentId);
    await fs.mkdir(subagentWorkspace, { recursive: true });

    // Build subagent system prompt
    const systemPrompt = await this.contextBuilder.build({
      userId: parentUserId,
      sessionId: subagentId,
      userMessage: objective,
      loadedSkills: preloadSkills,
      memoryClient: this.memoryClient,
    });

    const toolRegistry = buildDefaultRegistry();
    const tools = toolRegistry.getAll();

    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: `You are a subagent. Complete this objective and save your findings to files in the workspace.

OBJECTIVE:
${objective}

IMPORTANT:
- Save all significant findings/output to files in the workspace
- You cannot spawn further subagents
- Be focused and efficient — complete the objective, then stop
- If you create files, list them at the end of your response`,
      },
    ];

    const filesBeforeRun = await this.listWorkspaceFiles(subagentWorkspace);

    const result = await this.agentLoop.run(messages, {
      sessionId: subagentId,
      userId: parentUserId,
      workspacePath: subagentWorkspace,
      modelConfig,
      systemPrompt,
      tools,
    });

    const filesAfterRun = await this.listWorkspaceFiles(subagentWorkspace);
    const newFiles = filesAfterRun.filter(f => !filesBeforeRun.includes(f));

    return {
      subagentId,
      taskName,
      success: true,
      output: result.finalText,
      filesCreated: newFiles,
      steps: result.steps,
    };
  }

  /**
   * Spawn multiple subagents in parallel and collect all results.
   * This is the core of Computer's wide_research / wide_browse pattern.
   */
  async spawnParallel(jobs: SubagentSpawnOptions[]): Promise<SubagentResult[]> {
    return Promise.all(jobs.map(job => this.spawn(job)));
  }

  /**
   * Synthesise results from multiple subagents into a unified output.
   * The parent reads all subagent output files and writes a synthesis.
   */
  async synthesise(
    results: SubagentResult[],
    synthesisPrompt: string,
    workspacePath: string,
    modelConfig: ModelConfig = DEFAULT_SUBAGENT_MODEL,
  ): Promise<string> {
    const summaries = results.map(r =>
      `## ${r.taskName}\n${r.output}\nFiles created: ${r.filesCreated.join(', ') || 'none'}`,
    ).join('\n\n---\n\n');

    const messages: LLMMessage[] = [
      {
        role: 'user',
        content: `${synthesisPrompt}\n\n## Subagent Results\n\n${summaries}`,
      },
    ];

    const result = await this.agentLoop.run(messages, {
      sessionId: 'synthesis',
      userId: 'system',
      workspacePath,
      modelConfig,
      systemPrompt: 'You are synthesising results from multiple parallel subagents into a cohesive unified output.',
      tools: [],
    });

    return result.finalText;
  }

  private async listWorkspaceFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { recursive: true });
      return entries.map(e => e.toString());
    } catch {
      return [];
    }
  }
}

// ── Tool definition: run_subagent ────────────────────────────────────────────

import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';

const orchestrator = new SubagentOrchestrator();

export const runSubagentTool: RegisteredTool = {
  name: 'run_subagent',
  description: `Launch a subagent to handle complex, multi-step tasks autonomously.
Use to: delegate complex subtasks, parallelise work, isolate tasks needing focused attention.
MANDATORY for: searching connected apps, batch data processing, email/calendar searches.
Each subagent gets its own context window — prevents parent context overflow.`,
  category: 'orchestration',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      objective: { type: 'string', description: 'Detailed instructions. Reference workspace file paths for large inputs — do not inline large datasets.' },
      task_name: { type: 'string', description: 'Short user-friendly name e.g. "Research competitors"' },
      user_description: { type: 'string', description: 'Brief description shown in the activity timeline' },
      subagent_type: {
        type: 'string',
        enum: ['research', 'coding', 'asset', 'website_building', 'general_purpose'],
      },
      model: {
        type: 'string',
        description: 'Override model: claude_sonnet, gpt_4o, gemini_pro, gpt_4o_mini',
      },
    },
    required: ['objective', 'task_name', 'user_description', 'subagent_type'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { objective, task_name, user_description, model } = input as {
      objective: string; task_name: string; user_description: string; model?: string;
    };

    const modelConfig = resolveModel(model);
    const subagentId = `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await orchestrator.spawn({
      subagentId,
      parentSessionId: opts.sessionId,
      parentUserId: opts.userId,
      workspacePath: opts.workspacePath,
      objective,
      taskName: task_name,
      userDescription: user_description,
      modelConfig,
    });

    return {
      success: result.success,
      output: {
        subagent_id: result.subagentId,
        output: result.output,
        files_created: result.filesCreated,
        steps: result.steps,
      },
      userDescription: user_description,
      error: result.error,
    };
  },
};

function resolveModel(model?: string): ModelConfig {
  const map: Record<string, ModelConfig> = {
    claude_sonnet: { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
    gpt_4o: { modelId: 'gpt-4o', provider: 'openai' },
    gpt_4o_mini: { modelId: 'gpt-4o-mini', provider: 'openai' },
    gemini_pro: { modelId: 'gemini-1.5-pro-latest', provider: 'google' },
  };
  return model ? (map[model] ?? DEFAULT_SUBAGENT_MODEL) : DEFAULT_SUBAGENT_MODEL;
}
