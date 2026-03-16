/**
 * Skill Loader
 *
 * Computer has 50+ domain-specific "skill" playbooks stored as markdown files.
 * When a relevant task is detected, the skill is loaded from disk and injected
 * into the system prompt inside a <skill> tag.
 *
 * Skills are expert instruction sets — e.g.:
 *   - research-assistant: "Before answering any factual question, always search first..."
 *   - office/pptx: "When creating presentations, use these layout rules..."
 *   - sales/outreach: "Draft outreach using the following voice guidelines..."
 *
 * The agent calls load_skill(name) → the markdown content is injected into context.
 * Skills can reference sub-skills (parent/child namespacing).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';

const SKILLS_DIR = path.join(process.cwd(), 'skills');

export interface SkillManifest {
  name: string;
  title: string;
  description: string;
  path: string;
  subSkills?: string[];
}

export class SkillLoader {
  private cache = new Map<string, string>();

  async load(skillName: string): Promise<string> {
    if (this.cache.has(skillName)) return this.cache.get(skillName)!;

    const skillPath = this.resolvePath(skillName);

    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      this.cache.set(skillName, content);
      return content;
    } catch {
      throw new Error(`Skill not found: ${skillName} (looked for ${skillPath})`);
    }
  }

  async loadMany(skillNames: string[]): Promise<string[]> {
    return Promise.all(skillNames.map(n => this.load(n)));
  }

  async listAvailable(): Promise<SkillManifest[]> {
    try {
      const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
      const manifests: SkillManifest[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Parent skill with sub-skills
          const subDir = path.join(SKILLS_DIR, entry.name);
          const subEntries = await fs.readdir(subDir, { withFileTypes: true }).catch(() => []);
          const subSkills = subEntries
            .filter(e => e.name.endsWith('.md'))
            .map(e => `${entry.name}/${path.basename(e.name, '.md')}`);

          manifests.push({
            name: entry.name,
            title: titleCase(entry.name),
            description: `${entry.name} skill`,
            path: path.join(SKILLS_DIR, entry.name, 'SKILL.md'),
            subSkills,
          });
        } else if (entry.name.endsWith('.md')) {
          const name = path.basename(entry.name, '.md');
          manifests.push({
            name,
            title: titleCase(name),
            description: `${name} skill`,
            path: path.join(SKILLS_DIR, entry.name),
          });
        }
      }

      return manifests;
    } catch {
      return [];
    }
  }

  private resolvePath(skillName: string): string {
    // "research-assistant" → skills/research-assistant.md
    // "office/pptx" → skills/office/pptx.md
    const parts = skillName.split('/');
    if (parts.length === 1) {
      return path.join(SKILLS_DIR, `${skillName}.md`);
    }
    return path.join(SKILLS_DIR, ...parts.slice(0, -1), `${parts[parts.length - 1]}.md`);
  }
}

function titleCase(str: string): string {
  return str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Tool definition ──────────────────────────────────────────────────────────

const skillLoader = new SkillLoader();

export const loadSkillTool: RegisteredTool = {
  name: 'load_skill',
  description: `Load a skill playbook into context. Skills are expert instruction sets for specific domains.
Call proactively when working on a task that matches an available skill.
Available skills include: research-assistant, office/pptx, office/docx, office/xlsx,
marketing/content-creation, sales/outreach, data/visualization, and more.`,
  category: 'orchestration',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Skill name e.g. "research-assistant" or "office/pptx"' },
    },
    required: ['name'],
  },
  async execute(input: Record<string, unknown>, _opts: ToolExecuteOptions): Promise<ToolResult> {
    const { name } = input as { name: string };

    const content = await skillLoader.load(name);
    return {
      success: true,
      output: { skill: name, content },
      userDescription: `Loading skill: ${name}`,
    };
  },
};
