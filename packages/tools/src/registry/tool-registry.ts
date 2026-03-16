/**
 * Tool Registry
 *
 * Single source of truth for all tools available to the agent.
 * At runtime, the agent gets: first-party tools + connector tools
 * (OAuth integrations discovered dynamically).
 *
 * Computer has ~50 first-party tools. We mirror all categories here.
 */

import type { RegisteredTool } from '@infinius/agent-core';

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool already registered: ${tool.name} — overwriting`);
    }
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: RegisteredTool[]): void {
    for (const tool of tools) this.register(tool);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: string): RegisteredTool[] {
    return this.getAll().filter(t => t.category === category);
  }

  /** Merge connector tools (OAuth integrations) at runtime */
  mergeConnectorTools(connectorTools: RegisteredTool[]): RegisteredTool[] {
    return [...this.getAll(), ...connectorTools];
  }

  toJSON(): object {
    return Object.fromEntries(
      Array.from(this.tools.entries()).map(([k, v]) => [
        k,
        { name: v.name, description: v.description, category: v.category },
      ]),
    );
  }
}
