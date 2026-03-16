export { ToolRegistry } from './registry/tool-registry.js';
export { searchWebTool, fetchUrlTool, searchVerticalTool } from './definitions/search.js';
export { readFileTool, writeFileTool, editFileTool, globTool, grepTool } from './definitions/filesystem.js';
export { bashTool } from './definitions/bash.js';
export { browserTaskTool, screenshotPageTool } from './definitions/browser.js';
export { memorySearchTool, memoryUpdateTool } from './definitions/memory-tools.js';
export { sendNotificationTool, submitAnswerTool, confirmActionTool } from './definitions/notification.js';

import { ToolRegistry } from './registry/tool-registry.js';
import { searchWebTool, fetchUrlTool, searchVerticalTool } from './definitions/search.js';
import { readFileTool, writeFileTool, editFileTool, globTool, grepTool } from './definitions/filesystem.js';
import { bashTool } from './definitions/bash.js';
import { browserTaskTool, screenshotPageTool } from './definitions/browser.js';
import { memorySearchTool, memoryUpdateTool } from './definitions/memory-tools.js';
import { sendNotificationTool, submitAnswerTool, confirmActionTool } from './definitions/notification.js';

/**
 * Build and return the default tool registry with all first-party tools registered.
 * Connector tools (OAuth integrations) are added dynamically at runtime.
 */
export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.registerMany([
    // Research
    searchWebTool, fetchUrlTool, searchVerticalTool,
    // Filesystem
    readFileTool, writeFileTool, editFileTool, globTool, grepTool,
    // Code execution
    bashTool,
    // Browser
    browserTaskTool, screenshotPageTool,
    // Memory
    memorySearchTool, memoryUpdateTool,
    // Notifications & UX
    sendNotificationTool, submitAnswerTool, confirmActionTool,
  ]);

  return registry;
}
