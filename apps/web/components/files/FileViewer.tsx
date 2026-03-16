/**
 * FileViewer.tsx
 *
 * Full-screen overlay that renders a shared file.
 *
 * Supported rendering strategies by mime type:
 *   - PDF            → <iframe> with the direct file URL
 *   - Images         → <img>
 *   - Markdown/text  → fetches raw text, renders with react-markdown
 *   - CSV/JSON       → raw <pre> with syntax highlighting
 *   - Everything else → "download to view" fallback
 *
 * Opened by FileCard onClick or by clicking an inline file reference in
 * the chat stream.
 */

'use client';

import React, { useEffect, useState } from 'react';
import type { SharedFile } from '../../lib/api-client';
import { files as filesApi } from '../../lib/api-client';

interface Props {
  file: SharedFile;
  onClose: () => void;
}

type ViewMode = 'pdf' | 'image' | 'text' | 'download';

function getViewMode(mimeType: string): ViewMode {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json'
  )
    return 'text';
  return 'download';
}

export function FileViewer({ file, onClose }: Props) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const mode = getViewMode(file.mime_type);

  // Fetch raw text for text-mode files
  useEffect(() => {
    if (mode !== 'text') return;
    fetch(file.url)
      .then((r) => r.text())
      .then(setTextContent)
      .catch(() => setTextContent('(Could not load file content)'));
  }, [file.url, mode]);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <div>
            <p className="font-medium text-neutral-100">{file.name}</p>
            <p className="text-xs text-neutral-500">
              {file.mime_type} ·{' '}
              {file.size < 1024 * 1024
                ? `${(file.size / 1024).toFixed(1)} KB`
                : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Download button */}
            <a
              href={filesApi.download(file.id)}
              download={file.name}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-700"
            >
              Download
            </a>
            {/* Close */}
            <button
              onClick={onClose}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-700"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {mode === 'pdf' && (
            <iframe
              src={file.url}
              className="h-full w-full"
              title={file.name}
            />
          )}

          {mode === 'image' && (
            <div className="flex h-full items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.url}
                alt={file.name}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            </div>
          )}

          {mode === 'text' && (
            <pre className="h-full w-full overflow-auto bg-neutral-950 p-4 text-xs leading-relaxed text-neutral-300">
              {textContent ?? 'Loading…'}
            </pre>
          )}

          {mode === 'download' && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-neutral-400">
              <span className="text-5xl">📎</span>
              <p className="text-sm">This file type cannot be previewed.</p>
              <a
                href={filesApi.download(file.id)}
                download={file.name}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                Download {file.name}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
