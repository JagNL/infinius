/**
 * AskUserQuestionDialog.tsx
 *
 * Rendered when the agent emits an `ask_user_question` SSE event.
 * The agent loop is suspended until the user answers.
 *
 * Supports:
 *   - Single-select (radio-style pill buttons)
 *   - Multi-select (checkbox-style pill buttons, multi_select: true)
 *   - Free-text "Other" fallback on every question
 *   - Up to 4 questions in a single dialog
 *
 * SSE event shape:
 *   {
 *     type: 'ask_user_question',
 *     id: string,
 *     title: string,
 *     questions: Array<{
 *       question: string,
 *       header: string,
 *       multi_select?: boolean,
 *       options: Array<{ label: string, description?: string }>
 *     }>
 *   }
 *
 * On submit we POST to /chat/:sessionId/interrupt with:
 *   { type: 'ask_user_question', id, answers: Record<index, string | string[]> }
 */

'use client';

import React, { useState } from 'react';
import { sendInterrupt } from '../../lib/api-client';

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  question: string;
  header: string;
  multi_select?: boolean;
  options: QuestionOption[];
}

export interface AskUserQuestionPayload {
  id: string;
  title: string;
  questions: Question[];
}

interface Props {
  sessionId: string;
  payload: AskUserQuestionPayload;
  onResolved: () => void;
}

type Answers = Record<number, string[]>;

export function AskUserQuestionDialog({ sessionId, payload, onResolved }: Props) {
  // Track selections per question index
  const [answers, setAnswers] = useState<Answers>({});
  // "Other" free-text per question index
  const [otherText, setOtherText] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);

  function toggle(qIdx: number, label: string, multi: boolean) {
    setAnswers((prev) => {
      const current = prev[qIdx] ?? [];
      if (multi) {
        return {
          ...prev,
          [qIdx]: current.includes(label)
            ? current.filter((l) => l !== label)
            : [...current, label],
        };
      }
      // Single-select — replace
      return { ...prev, [qIdx]: [label] };
    });
  }

  function isSelected(qIdx: number, label: string): boolean {
    return (answers[qIdx] ?? []).includes(label);
  }

  function canSubmit(): boolean {
    // Every question must have at least one answer (option or other text)
    return payload.questions.every((_, idx) => {
      const selected = answers[idx] ?? [];
      const other = otherText[idx]?.trim() ?? '';
      return selected.length > 0 || other.length > 0;
    });
  }

  async function submit() {
    setLoading(true);
    try {
      // Merge "other" text into answers
      const finalAnswers: Record<number, string | string[]> = {};
      payload.questions.forEach((q, idx) => {
        const selected = answers[idx] ?? [];
        const other = otherText[idx]?.trim() ?? '';
        const all = other ? [...selected, other] : selected;
        finalAnswers[idx] = q.multi_select ? all : all[0] ?? '';
      });

      await sendInterrupt(sessionId, {
        type: 'ask_user_question',
        id: payload.id,
        answers: finalAnswers,
      });
    } finally {
      setLoading(false);
      onResolved();
    }
  }

  return (
    <div className="my-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
      {/* Title */}
      <p className="mb-4 font-medium text-neutral-100">{payload.title}</p>

      <div className="space-y-5">
        {payload.questions.map((q, qIdx) => (
          <div key={qIdx}>
            {/* Header chip */}
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-400">
                {q.header}
              </span>
              {q.multi_select && (
                <span className="text-xs text-neutral-500">(select all that apply)</span>
              )}
            </div>

            {/* Question text */}
            <p className="mb-2 text-neutral-200">{q.question}</p>

            {/* Option pills */}
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => {
                const selected = isSelected(qIdx, opt.label);
                return (
                  <button
                    key={opt.label}
                    title={opt.description}
                    onClick={() => toggle(qIdx, opt.label, q.multi_select ?? false)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      selected
                        ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                        : 'border-neutral-600 bg-neutral-800 text-neutral-300 hover:border-neutral-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* "Other" free-text */}
            <input
              type="text"
              placeholder="Other…"
              value={otherText[qIdx] ?? ''}
              onChange={(e) =>
                setOtherText((prev) => ({ ...prev, [qIdx]: e.target.value }))
              }
              className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500"
            />
          </div>
        ))}
      </div>

      <button
        onClick={submit}
        disabled={!canSubmit() || loading}
        className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
      >
        {loading ? 'Submitting…' : 'Submit'}
      </button>
    </div>
  );
}
