/**
 * Scheduler — Cron jobs + delayed actions + notifications
 *
 * Computer has two scheduling primitives:
 *
 * 1. schedule_cron — recurring tasks (BullMQ repeatable jobs)
 *    "Check my inbox for investor replies every hour"
 *    "Send a weekly sales summary every Monday at 9am"
 *
 * 2. pause_and_wait — one-time delayed actions (BullMQ delayed jobs)
 *    "Send this email at 9am tomorrow" → sleep N minutes → wake + execute
 *    "Follow up if no reply in 48 hours"
 *
 * Architecture:
 * - Jobs stored in Redis via BullMQ
 * - Worker pulls jobs, runs a full AgentLoop turn with the task as the prompt
 * - If the agent calls send_notification → push to user via WebSocket/SSE
 * - Cron jobs persist until explicitly deleted (schedule_cron delete)
 */

import { Queue, Worker, type Job } from 'bullmq';
import { AgentLoop, ContextBuilder } from '@infinius/agent-core';
import type { LLMMessage, ModelConfig } from '@infinius/agent-core';
import { MemoryClient } from '@infinius/memory';
import { buildDefaultRegistry } from '@infinius/tools';
import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';

export interface CronJobDefinition {
  cronId: string;
  userId: string;
  name: string;
  task: string;
  /** Cron expression in UTC e.g. "0 17 * * 1" */
  cron: string;
  /** If true, runs at exact scheduled time with no jitter */
  exact?: boolean;
  /** Background = isolated agent with no conversation history */
  background?: boolean;
  modelConfig?: ModelConfig;
}

export interface DelayedJobDefinition {
  jobId: string;
  userId: string;
  sessionId: string;
  task: string;
  /** Delay in milliseconds */
  delayMs: number;
  /** Context to restore when the job wakes */
  metadata?: Record<string, unknown>;
}

const QUEUE_NAME = 'infinius-agent-jobs';

export class Scheduler {
  private queue: Queue;
  private worker: Worker | null = null;
  private connection: { url: string; maxRetriesPerRequest: null };
  private agentLoop = new AgentLoop();
  private contextBuilder = new ContextBuilder();
  private memoryClient = new MemoryClient();

  constructor() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.connection = { url: redisUrl, maxRetriesPerRequest: null };
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
  }

  // ── Cron Jobs ────────────────────────────────────────────────

  async createCron(def: CronJobDefinition): Promise<void> {
    await this.queue.upsertJobScheduler(
      def.cronId,
      { pattern: def.cron },
      {
        name: 'cron',
        data: { type: 'cron', ...def },
        opts: {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
    );
  }

  async deleteCron(cronId: string): Promise<void> {
    await this.queue.removeJobScheduler(cronId);
  }

  async listCrons(userId: string): Promise<CronJobDefinition[]> {
    const schedulers = await this.queue.getJobSchedulers();
    return schedulers
      .filter((s) => (s as unknown as { data: CronJobDefinition }).data?.userId === userId)
      .map((s) => (s as unknown as { data: CronJobDefinition }).data);
  }

  // ── Delayed (pause_and_wait) ─────────────────────────────────

  async scheduleDelayed(def: DelayedJobDefinition): Promise<void> {
    await this.queue.add(
      'delayed',
      { type: 'delayed', ...def },
      { delay: def.delayMs, jobId: def.jobId },
    );
  }

  async cancelDelayed(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) await job.remove();
  }

  // ── Worker ────────────────────────────────────────────────────

  startWorker(): void {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        await this.processJob(job);
      },
      { connection: { ...this.connection }, concurrency: 5 },
    );

    this.worker.on('failed', (job, err) => {
      console.error(`[Scheduler] Job ${job?.id} failed:`, err);
    });

    console.log('[Scheduler] Worker started');
  }

  private async processJob(job: Job): Promise<void> {
    const data = job.data as (CronJobDefinition | DelayedJobDefinition) & { type: string };
    const { userId, task } = data;

    const workspacePath = `${process.env.WORKSPACE_BASE_PATH ?? '/tmp/infinius-workspaces'}/cron-${userId}-${job.id}`;

    const systemPrompt = await this.contextBuilder.build({
      userId,
      sessionId: job.id ?? 'cron',
      userMessage: task,
      memoryClient: this.memoryClient,
    });

    const messages: LLMMessage[] = [{ role: 'user', content: task }];

    const toolRegistry = buildDefaultRegistry();

    await this.agentLoop.run(messages, {
      sessionId: job.id ?? 'cron',
      userId,
      workspacePath,
      modelConfig: {
        modelId: process.env.DEFAULT_AGENT_MODEL as any ?? 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
      },
      systemPrompt,
      tools: toolRegistry.getAll(),
    });
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    // connection is a plain options object, nothing to quit
  }
}

// ── Tool definitions for the agent to call ───────────────────────────────────

// Lazy singleton — instantiated on first tool use, not at module load time
let _scheduler: Scheduler | null = null;
function getScheduler(): Scheduler {
  if (!_scheduler) _scheduler = new Scheduler();
  return _scheduler;
}

export const scheduleCronTool: RegisteredTool = {
  name: 'schedule_cron',
  description: `Create, update, list, or delete recurring scheduled tasks.
Use for tasks that run periodically: daily monitoring, weekly reports, hourly inbox checks.
NEVER say "cron job" to users — call them "recurring tasks" or "scheduled tasks".
Minimum frequency is 1 hour. Cron expressions in UTC.`,
  category: 'scheduling',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'update', 'list', 'delete'] },
      cron_id: { type: 'string', description: 'Required for update/delete' },
      name: { type: 'string', description: 'Human-readable task name. Required for create.' },
      task: { type: 'string', description: 'What to do when triggered. Required for create.' },
      cron: { type: 'string', description: 'Cron expression in UTC. Required for create.' },
      exact: { type: 'boolean', description: 'Run at exact scheduled time (no jitter)' },
      user_description: { type: 'string' },
    },
    required: ['action', 'user_description'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { action, cron_id, name, task, cron, exact, user_description } = input as {
      action: 'create' | 'update' | 'list' | 'delete';
      cron_id?: string;
      name?: string;
      task?: string;
      cron?: string;
      exact?: boolean;
      user_description: string;
    };

    switch (action) {
      case 'create': {
        const id = cron_id ?? `cron-${Date.now()}`;
        await getScheduler().createCron({ cronId: id, userId: opts.userId, name: name!, task: task!, cron: cron!, exact });
        return { success: true, output: { cronId: id, name, cron }, userDescription: user_description };
      }
      case 'delete': {
        await getScheduler().deleteCron(cron_id!);
        return { success: true, output: { deleted: cron_id }, userDescription: user_description };
      }
      case 'list': {
        const jobs = await getScheduler().listCrons(opts.userId);
        return { success: true, output: { jobs }, userDescription: user_description };
      }
      default:
        return { success: false, output: null, error: `Unknown action: ${action}` };
    }
  },
};

export const pauseAndWaitTool: RegisteredTool = {
  name: 'pause_and_wait',
  description: `Pause the workflow for a specified time period. Use for one-time waits:
- Rate limit hit → sleep until reset
- Waiting for external event (email reply, approval)
- One-time delayed action: "send this email at 9am tomorrow"
NOT for recurring tasks — use schedule_cron instead.`,
  category: 'scheduling',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      wait_minutes: { type: 'integer', description: 'Number of minutes to wait' },
      reason: { type: 'string', description: 'Internal reason for the pause' },
      next_steps: { type: 'string', description: 'What to do when resuming' },
      ai_response: { type: 'string', description: 'Message to show the user while waiting' },
      metadata: { type: 'object', description: 'Key-value data to store during the pause' },
    },
    required: ['wait_minutes', 'reason', 'next_steps', 'ai_response'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { wait_minutes, reason, next_steps, ai_response, metadata } = input as {
      wait_minutes: number; reason: string; next_steps: string; ai_response: string; metadata?: Record<string, unknown>;
    };

    const delayMs = wait_minutes * 60 * 1000;
    const jobId = `pause-${opts.sessionId}-${Date.now()}`;

    await getScheduler().scheduleDelayed({
      jobId,
      userId: opts.userId,
      sessionId: opts.sessionId,
      task: next_steps,
      delayMs,
      metadata: { ...metadata, reason, next_steps },
    });

    return {
      success: true,
      output: { paused: true, jobId, wait_minutes, ai_response },
      userDescription: `Waiting ${wait_minutes} minutes: ${reason}`,
    };
  },
};
