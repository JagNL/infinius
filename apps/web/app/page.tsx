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
    <div className="flex h-screen overflow-hidden">
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
        className="fixed top-4 right-4 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-100 transition-colors"
        title="Memory panel"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
        </svg>
      </button>
    </div>
  );
}
