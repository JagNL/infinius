/**
 * Notification + Action Confirmation Tools
 *
 * Computer has: send_notification, confirm_action, ask_user_question, submit_answer
 * These are the agent's way of communicating back to the user mid-turn.
 */

import type { RegisteredTool, ToolResult, ToolExecuteOptions } from '@infinius/agent-core';

export const sendNotificationTool: RegisteredTool = {
  name: 'send_notification',
  description: 'Send an in-app notification to the user when a scheduled task finds noteworthy information. Only use when there is genuinely new information worth surfacing.',
  category: 'notification',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short notification title' },
      body: { type: 'string', description: 'Notification body with the key details' },
      url: { type: 'string', description: 'Optional URL relevant to the notification' },
      schedule_description: { type: 'string', description: 'Cadence label e.g. "Daily · 9am"' },
    },
    required: ['title', 'body'],
  },
  async execute(input: Record<string, unknown>, opts: ToolExecuteOptions): Promise<ToolResult> {
    const { title, body, url, schedule_description } = input as {
      title: string; body: string; url?: string; schedule_description?: string;
    };

    // In production: push via WebSocket, Pusher, or Ably to the connected client
    // For now: persist to DB and let the frontend poll/subscribe
    console.log(`[NOTIFICATION] ${opts.userId}: ${title} — ${body}`);

    return {
      success: true,
      output: { sent: true, title, body },
      userDescription: `Sending notification: ${title}`,
    };
  },
};

export const submitAnswerTool: RegisteredTool = {
  name: 'submit_answer',
  description: 'Submit the final answer to the user. The answer will be streamed as it is generated. Call this as the last step of any turn.',
  category: 'notification',
  isVisible: false,
  inputSchema: {
    type: 'object',
    properties: {
      answer: { type: 'string', description: 'The final answer in markdown' },
    },
    required: ['answer'],
  },
  async execute(input: Record<string, unknown>, _opts: ToolExecuteOptions): Promise<ToolResult> {
    const { answer } = input as { answer: string };
    return { success: true, output: { answer } };
  },
};

export const confirmActionTool: RegisteredTool = {
  name: 'confirm_action',
  description: 'Request user confirmation before executing irreversible actions (sending emails, making purchases, deleting data). Include the full draft content in the placeholder field.',
  category: 'notification',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Short action label e.g. "send email"' },
      question: { type: 'string', description: 'Confirmation question for the user' },
      placeholder: { type: 'string', description: 'Full draft content for review' },
    },
    required: ['action', 'question'],
  },
  async execute(input: Record<string, unknown>, _opts: ToolExecuteOptions): Promise<ToolResult> {
    // In production: pause execution, send to frontend, await user response
    // The session is suspended until the user approves/denies
    return {
      success: true,
      output: { status: 'pending_confirmation', action: input.action, question: input.question },
      userDescription: `Requesting confirmation: ${input.action}`,
    };
  },
};
