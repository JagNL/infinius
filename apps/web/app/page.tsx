'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { ActivityTimeline } from '../components/tools/ActivityTimeline';
import { MemoryPanel } from '../components/memory/MemoryPanel';
import { SessionSidebar } from '../components/layout/SessionSidebar';
import type { Message, ToolActivity } from '../lib/types';

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => `session-${Date.now()}`);
  const [showMemory, setShowMemory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = async (content: string) => {
    if (isStreaming) return;

    // Add user message immediately
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    // Placeholder for streaming assistant response
    const assistantMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', createdAt: new Date().toISOString(), isStreaming: true }]);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, sessionId }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleSSEEvent(event, assistantMsgId);
          } catch {
            // ignore malformed JSON
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Chat error:', err);
      }
    } finally {
      setIsStreaming(false);
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, isStreaming: false } : m));
    }
  };

  const handleSSEEvent = (event: { type: string; [key: string]: unknown }, assistantMsgId: string) => {
    switch (event.type) {
      case 'text_delta':
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: m.content + (event.text as string) } : m,
        ));
        break;
      case 'tool_activity':
        setToolActivity(prev => [...prev, {
          id: Date.now().toString(),
          toolName: event.toolName as string,
          description: event.description as string,
          status: 'running',
          startedAt: new Date().toISOString(),
        }]);
        break;
      case 'tool_done':
        setToolActivity(prev => prev.map(a =>
          a.toolName === event.toolName && a.status === 'running'
            ? { ...a, status: 'completed', completedAt: new Date().toISOString() }
            : a,
        ));
        break;
      case 'done':
        break;
      case 'error':
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: m.content + `\n\n⚠️ Error: ${event.message}` } : m,
        ));
        break;
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950">
      {/* Left sidebar: session history */}
      <SessionSidebar
        currentSessionId={sessionId}
        onSessionSelect={setSessionId}
        onNewSession={() => {
          setSessionId(`session-${Date.now()}`);
          setMessages([]);
          setToolActivity([]);
        }}
      />

      {/* Main chat area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <MessageList messages={messages} />

        {/* Activity timeline: tool calls shown between messages */}
        {toolActivity.length > 0 && (
          <ActivityTimeline activities={toolActivity} />
        )}

        <ChatInput
          onSend={sendMessage}
          onStop={stopGeneration}
          isStreaming={isStreaming}
          disabled={false}
        />
      </main>

      {/* Right panel: memory (toggle) */}
      {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}

      {/* Memory toggle button */}
      <button
        onClick={() => setShowMemory(v => !v)}
        className={`fixed top-4 right-4 p-2 rounded-lg transition-colors ${
          showMemory
            ? 'bg-violet-600/20 text-violet-400 hover:bg-violet-600/30'
            : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-500 hover:text-neutral-200'
        }`}
        title="Memory"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      </button>
    </div>
  );
}
