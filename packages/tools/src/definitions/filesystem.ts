/**
 * Filesystem Tools
 *
 * Computer has a persistent workspace directory per session.
 * Files created persist within the session and can be shared with subagents.
 * Mirrors: read, write, edit, glob, grep tools.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob as globAsync } from 'glob';
import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';

function resolveSafe(workspacePath: string, filePath: string): string {
  const resolved = path.resolve(workspacePath, filePath);
  if (!resolved.startsWith(workspacePath)) {
    throw new Error('Path traversal attempt blocked');
  }
  return resolved;
}

export const readFileTool: RegisteredTool = {
  name: 'read_file',
  description: 'Read a file from the workspace. Returns up to 2000 lines by default.',
  category: 'filesystem',
  isVisible: false,
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to the file (relative to workspace)' },
      offset: { type: 'integer', description: 'Line number to start reading from' },
      limit: { type: 'integer', description: 'Number of lines to read' },
    },
    required: ['file_path'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { file_path, offset = 0, limit = 2000 } = input as { file_path: string; offset?: number; limit?: number };
    const fullPath = resolveSafe(opts.workspacePath, file_path);
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n').slice(offset as number, (offset as number) + (limit as number));
    return { success: true, output: { content: lines.join('\n'), total_lines: content.split('\n').length } };
  },
};

export const writeFileTool: RegisteredTool = {
  name: 'write_file',
  description: 'Create or overwrite a file in the workspace.',
  category: 'filesystem',
  isVisible: false,
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to write (relative to workspace)' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['file_path', 'content'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { file_path, content } = input as { file_path: string; content: string };
    const fullPath = resolveSafe(opts.workspacePath, file_path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return { success: true, output: { written: true, path: file_path, size_bytes: Buffer.byteLength(content) } };
  },
};

export const editFileTool: RegisteredTool = {
  name: 'edit_file',
  description: 'Make exact string replacements in a file. Fails if old_string is not found.',
  category: 'filesystem',
  isVisible: false,
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      old_string: { type: 'string', description: 'The exact text to replace' },
      new_string: { type: 'string', description: 'The replacement text' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { file_path, old_string, new_string, replace_all = false } = input as {
      file_path: string; old_string: string; new_string: string; replace_all?: boolean;
    };
    const fullPath = resolveSafe(opts.workspacePath, file_path);
    const content = await fs.readFile(fullPath, 'utf-8');

    if (!content.includes(old_string)) {
      return { success: false, error: `old_string not found in ${file_path}`, output: null };
    }

    const updated = replace_all
      ? content.split(old_string).join(new_string)
      : content.replace(old_string, new_string);

    await fs.writeFile(fullPath, updated, 'utf-8');
    return { success: true, output: { file_path, replaced: true } };
  },
};

export const globTool: RegisteredTool = {
  name: 'glob_files',
  description: 'Find files matching a glob pattern in the workspace.',
  category: 'filesystem',
  isVisible: false,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern e.g. **/*.ts' },
    },
    required: ['pattern'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { pattern } = input as { pattern: string };
    const files = await globAsync(pattern, { cwd: opts.workspacePath });
    return { success: true, output: { files } };
  },
};

export const grepTool: RegisteredTool = {
  name: 'grep_files',
  description: 'Search file contents for a regex pattern in the workspace.',
  category: 'filesystem',
  isVisible: false,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      glob: { type: 'string', description: 'Glob pattern to filter files' },
      ignore_case: { type: 'boolean' },
    },
    required: ['pattern'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { pattern, glob: globPattern = '**/*', ignore_case = false } = input as {
      pattern: string; glob?: string; ignore_case?: boolean;
    };

    const files = await globAsync(globPattern, { cwd: opts.workspacePath, nodir: true });
    const regex = new RegExp(pattern, ignore_case ? 'gi' : 'g');
    const matches: Array<{ file: string; line: number; content: string }> = [];

    for (const file of files.slice(0, 100)) {
      const fullPath = path.join(opts.workspacePath, file);
      const content = await fs.readFile(fullPath, 'utf-8').catch(() => '');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (regex.test(line)) {
          matches.push({ file, line: i + 1, content: line.trim() });
        }
        regex.lastIndex = 0;
      });
    }

    return { success: true, output: { matches: matches.slice(0, 200) } };
  },
};
