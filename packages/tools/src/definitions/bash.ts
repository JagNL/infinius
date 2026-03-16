/**
 * Bash / Code Execution Tool
 *
 * Computer runs code in a sandboxed Linux VM with Python, Node.js,
 * ffmpeg, yt-dlp pre-installed. The agent can install packages on the fly.
 *
 * SECURITY: In production, use a proper sandbox (gVisor, Firecracker,
 * or a managed service like E2B / Modal). This implementation uses
 * child_process with a timeout for development purposes.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 30_000; // 30s default, 10min max

export const bashTool: RegisteredTool = {
  name: 'bash',
  description: `Execute shell commands in the agent's sandboxed Linux environment.
Python, Node.js, ffmpeg, yt-dlp, and standard Unix tools are pre-installed.
Use for: data processing, running scripts, installing packages, file manipulation, API calls via curl.
The working directory is the session workspace. Commands run synchronously.`,
  category: 'code',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      timeout: { type: 'integer', description: 'Timeout in milliseconds (default 30000, max 600000)' },
      user_description: { type: 'string', description: 'Human-readable description shown in activity timeline' },
    },
    required: ['command', 'user_description'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const {
      command,
      timeout = DEFAULT_TIMEOUT_MS,
      user_description,
    } = input as { command: string; timeout?: number; user_description: string };

    const safeTimeout = Math.min(timeout as number, 600_000);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: opts.workspacePath,
        timeout: safeTimeout,
        env: {
          ...process.env,
          PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          HOME: opts.workspacePath,
        },
      });

      return {
        success: true,
        output: {
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 10_000),
          exit_code: 0,
        },
        userDescription: user_description,
      };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: number; message: string };
      return {
        success: false,
        output: {
          stdout: error.stdout?.slice(0, 50_000) ?? '',
          stderr: error.stderr?.slice(0, 10_000) ?? error.message,
          exit_code: error.code ?? 1,
        },
        error: error.message,
        userDescription: user_description,
      };
    }
  },
};
