/**
 * share_file tool
 *
 * Registers a workspace file for download by the frontend.
 * Inserts a row into the `shared_files` table in Supabase and returns
 * a signed public URL.  The SSE stream then emits a `file_shared` event
 * which the frontend uses to render a FileCard inline in the chat.
 *
 * Computer equivalent: share_file — makes generated assets downloadable.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredTool } from '../registry/types.js';

export const shareFileTool: RegisteredTool = {
  name: 'share_file',
  description:
    'Share a generated file with the user so they can download or preview it. ' +
    'Call this after creating any file (PDF, DOCX, PPTX, XLSX, image, audio, etc.) ' +
    'to surface it in the chat UI.',
  category: 'files',
  isVisible: true,
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file in the workspace',
      },
      name: {
        type: 'string',
        description:
          'Logical display name for this file (e.g. "quarterly_report"). ' +
          'Use the same name when sharing updated versions of the same asset.',
      },
    },
    required: ['file_path'],
  },

  async execute(input: { file_path: string; name?: string }, opts) {
    const { userId, sessionId } = opts;

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const filepath = input.file_path;
    const stat = await fs.stat(filepath);
    const ext = path.extname(filepath);
    const filename = input.name
      ? `${input.name}${ext}`
      : path.basename(filepath);

    // Upload to Supabase Storage (bucket: "workspace-files")
    const storageKey = `${userId}/${sessionId}/${Date.now()}_${path.basename(filepath)}`;
    const fileBuffer = await fs.readFile(filepath);

    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.csv': 'text/csv',
      '.json': 'application/json',
    };
    const contentType = mimeMap[ext.toLowerCase()] ?? 'application/octet-stream';

    const { error: uploadError } = await supabase.storage
      .from('workspace-files')
      .upload(storageKey, fileBuffer, { contentType, upsert: false });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get a signed URL (1 week)
    const { data: urlData } = await supabase.storage
      .from('workspace-files')
      .createSignedUrl(storageKey, 60 * 60 * 24 * 7);

    const publicUrl = urlData?.signedUrl ?? '';

    // Insert record in shared_files table
    const { data: record, error: dbError } = await supabase
      .from('shared_files')
      .insert({
        user_id: userId,
        session_id: sessionId,
        name: filename,
        size: stat.size,
        mime_type: contentType,
        storage_key: storageKey,
        url: publicUrl,
      })
      .select()
      .single();

    if (dbError) {
      throw new Error(`DB insert failed: ${dbError.message}`);
    }

    return {
      success: true,
      output: {
        file_id: record.id,
        name: filename,
        url: publicUrl,
        size: stat.size,
        mime_type: contentType,
        // This triggers a `file_shared` SSE event in the chat route
        _sse_event: { type: 'file_shared', file: record },
      },
    };
  },
};
