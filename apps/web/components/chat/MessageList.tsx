'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../../lib/types';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-lg">∞</span>
          </div>
          <h2 className="text-base font-semibold text-neutral-200 mb-1.5">What can I help with?</h2>
          <p className="text-sm text-neutral-500 leading-relaxed">
            Ask me to research, write, build, or automate anything.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-6">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        {messages.map(message => (
          <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>

            {/* Assistant avatar */}
            {message.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs text-violet-300">∞</span>
              </div>
            )}

            {/* Message bubble */}
            <div className={`max-w-2xl ${
              message.role === 'user'
                ? 'bg-neutral-800 border border-neutral-700/50 rounded-2xl rounded-tr-sm px-4 py-2.5'
                : 'text-neutral-100 rounded-2xl rounded-tl-sm'
            }`}>
              {message.role === 'assistant' ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:my-1 prose-headings:text-neutral-100 prose-code:text-violet-300 prose-code:bg-neutral-800 prose-pre:bg-neutral-900 prose-pre:border prose-pre:border-neutral-800">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content || (message.isStreaming ? '▊' : '')}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-neutral-100 whitespace-pre-wrap leading-relaxed">{message.content}</p>
              )}
            </div>

            {/* User avatar */}
            {message.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-medium text-neutral-300">U</span>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
