/**
 * ModelSelector.tsx
 *
 * Small dropdown in the chat input area that lets the user override the
 * default model for the next message.  Appears as a compact chip / button.
 *
 * The list of available models should eventually come from an API endpoint;
 * for now it's hardcoded to mirror what Computer exposes.
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface Model {
  id: string;
  label: string;
  provider: 'anthropic' | 'openai' | 'google';
  description?: string;
  default?: boolean;
}

const MODELS: Model[] = [
  {
    id: 'claude-3-5-sonnet-20241022',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: 'Default · fast, capable, low cost',
    default: true,
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    provider: 'anthropic',
    description: 'Highest quality · slower, higher cost',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    description: 'OpenAI flagship · great for code',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'openai',
    description: 'Fast and cheap',
  },
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini Flash',
    provider: 'google',
    description: 'Google · very fast',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini Pro',
    provider: 'google',
    description: 'Google · high quality',
  },
];

const PROVIDER_COLORS: Record<Model['provider'], string> = {
  anthropic: 'bg-orange-500/20 text-orange-300',
  openai: 'bg-green-500/20 text-green-300',
  google: 'bg-blue-500/20 text-blue-300',
};

interface Props {
  value: string | null;
  onChange: (modelId: string | null) => void;
}

export function ModelSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = MODELS.find((m) => m.id === value) ?? MODELS.find((m) => m.default)!;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Trigger chip */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs text-neutral-300 transition hover:border-neutral-500 hover:text-neutral-100"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            selected.provider === 'anthropic'
              ? 'bg-orange-400'
              : selected.provider === 'openai'
                ? 'bg-green-400'
                : 'bg-blue-400'
          }`}
        />
        {selected.label}
        <svg
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-72 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl">
          <div className="p-1">
            {MODELS.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  onChange(model.default ? null : model.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-neutral-800 ${
                  model.id === selected.id ? 'bg-neutral-800' : ''
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-100">
                      {model.label}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${PROVIDER_COLORS[model.provider]}`}
                    >
                      {model.provider}
                    </span>
                    {model.default && (
                      <span className="text-xs text-neutral-500">default</span>
                    )}
                  </div>
                  {model.description && (
                    <p className="text-xs text-neutral-500">{model.description}</p>
                  )}
                </div>
                {model.id === selected.id && (
                  <svg
                    className="h-4 w-4 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
