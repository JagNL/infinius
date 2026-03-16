/**
 * FileCard.tsx
 *
 * Compact representation of a shared file.  Clicking opens the full
 * FileViewer.  Used in the chat message stream (inline) and in the
 * right-panel file list.
 */

'use client';

import React from 'react';
import { type SharedFile } from '../../lib/api-client';

interface Props {
  file: SharedFile;
  onClick?: (file: SharedFile) => void;
}

const MIME_ICON: Record<string, string> = {
  'application/pdf': '📄',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📈',
  'image/png': '🖼',
  'image/jpeg': '🖼',
  'image/gif': '🖼',
  'image/webp': '🖼',
  'text/plain': '📃',
  'text/markdown': '📃',
  'text/csv': '📊',
  'application/json': '🔧',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getIcon(mimeType: string): string {
  return MIME_ICON[mimeType] ?? '📎';
}

function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
}

export function FileCard({ file, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(file)}
      className="flex w-48 items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 p-3 text-left transition hover:border-neutral-500 hover:bg-neutral-700"
    >
      {/* Icon */}
      <span className="text-2xl leading-none" aria-hidden>
        {getIcon(file.mime_type)}
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-neutral-100">{file.name}</p>
        <p className="text-xs text-neutral-500">
          {getExtension(file.name)} · {formatBytes(file.size)}
        </p>
      </div>
    </button>
  );
}
