'use client';

import { useState, useRef, type KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="px-4 pb-5 pt-3">
      <div className="max-w-3xl mx-auto">
        <div className="relative bg-neutral-800 rounded-2xl border border-neutral-700 focus-within:border-neutral-600 transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => { setValue(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to research, write, build, or automate anything..."
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent text-neutral-100 placeholder-neutral-500 px-4 py-3.5 pr-14 resize-none focus:outline-none text-sm leading-relaxed"
          />

          {/* Send / Stop button */}
          <div className="absolute right-3 bottom-3">
            {isStreaming ? (
              <button
                onClick={onStop}
                className="p-1.5 rounded-lg bg-neutral-600 hover:bg-neutral-500 text-neutral-300 transition-colors"
                title="Stop"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!value.trim() || disabled}
                className="p-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                title="Send"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] text-neutral-600 mt-2">
          Enter to send · Shift+↵ for new line
        </p>
      </div>
    </div>
  );
}
