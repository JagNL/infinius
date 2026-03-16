export { ToolRegistry } from './registry/tool-registry.js';
export { searchWebTool, fetchUrlTool, searchVerticalTool } from './definitions/search.js';
export { readFileTool, writeFileTool, editFileTool, globTool, grepTool } from './definitions/filesystem.js';
export { bashTool } from './definitions/bash.js';
export { browserTaskTool, screenshotPageTool } from './definitions/browser.js';
export { memorySearchTool, memoryUpdateTool } from './definitions/memory-tools.js';
export { sendNotificationTool, submitAnswerTool } from './definitions/notification.js';
export { shareFileTool } from './definitions/share-file.js';
export { askUserQuestionTool } from './definitions/ask-user-question.js';
export { confirmActionTool } from './definitions/confirm-action.js';
export { wideResearchTool } from './definitions/wide-research.js';
export { wideBrowseTool } from './definitions/wide-browse.js';

import { ToolRegistry } from './registry/tool-registry.js';
import { searchWebTool, fetchUrlTool, searchVerticalTool } from './definitions/search.js';
import { readFileTool, writeFileTool, editFileTool, globTool, grepTool } from './definitions/filesystem.js';
import { bashTool } from './definitions/bash.js';
import { browserTaskTool, screenshotPageTool } from './definitions/browser.js';
import { memorySearchTool, memoryUpdateTool } from './definitions/memory-tools.js';
import { sendNotificationTool, submitAnswerTool } from './definitions/notification.js';
import { shareFileTool } from './definitions/share-file.js';
import { askUserQuestionTool } from './definitions/ask-user-question.js';
import { confirmActionTool } from './definitions/confirm-action.js';
import { wideResearchTool } from './definitions/wide-research.js';
import { wideBrowseTool } from './definitions/wide-browse.js';

/**
 * Build and return the default tool registry with all first-party tools registered.
 * Connector tools (OAuth integrations) are added dynamically at runtime.
 */
export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.registerMany([
    // Research
    searchWebTool, fetchUrlTool, searchVerticalTool,
    // Batch research / browse
    wideResearchTool, wideBrowseTool,
    // Filesystem
    readFileTool, writeFileTool, editFileTool, globTool, grepTool,
    // Code execution
    bashTool,
    // Browser
    browserTaskTool, screenshotPageTool,
    // Memory
    memorySearchTool, memoryUpdateTool,
    // Files & sharing
    shareFileTool,
    // Notifications & UX
    sendNotificationTool, submitAnswerTool,
    // Mid-turn interaction (interrupt gate)
    askUserQuestionTool, confirmActionTool,
  ]);

  return registry;
}
