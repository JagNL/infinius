/**
 * Transcriber — Audio/video transcription via OpenAI Whisper.
 *
 * Accepts a local file path (any format ffmpeg can read) and returns
 * the transcript text.  Optionally saves it as a .txt file in the workspace.
 */

import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import fsp from 'node:fs/promises';

export interface TranscribeSpec {
  filePath: string;          // absolute path to audio/video file in workspace
  language?: string;         // ISO-639-1 code e.g. 'en', 'es'
  prompt?: string;           // optional context hint for accuracy
  saveTranscript?: boolean;  // write .txt to workspace, default true
  outputFilename?: string;
}

export interface TranscribeResult {
  text: string;
  filePath?: string;  // path of saved .txt if saveTranscript: true
  duration?: number;  // seconds (if returned by API)
}

export class Transcriber {
  async transcribe(
    spec: TranscribeSpec,
    workspacePath: string,
  ): Promise<TranscribeResult> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const fileStream = fs.createReadStream(spec.filePath);

    const response = await client.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-1',
      language: spec.language,
      prompt: spec.prompt,
      response_format: 'verbose_json',
    });

    const text = response.text;
    // @ts-expect-error verbose_json includes duration
    const duration = response.duration as number | undefined;

    let savedFilePath: string | undefined;
    if (spec.saveTranscript !== false) {
      const basename = path.basename(spec.filePath, path.extname(spec.filePath));
      const filename = `${spec.outputFilename ?? basename}_transcript.txt`;
      savedFilePath = path.join(workspacePath, filename);
      await fsp.writeFile(savedFilePath, text, 'utf-8');
    }

    return { text, filePath: savedFilePath, duration };
  }
}
