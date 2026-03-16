/**
 * TtsGenerator — Text-to-speech via OpenAI TTS or ElevenLabs.
 *
 * Provider selection:
 *   ELEVENLABS_API_KEY set → ElevenLabs (higher quality, more voices)
 *   Otherwise             → OpenAI TTS (tts-1 / tts-1-hd)
 *
 * Output: .mp3 file saved to workspacePath
 */

import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface TtsSpec {
  text: string;
  voice?: string;          // OpenAI: 'alloy'|'echo'|'fable'|'onyx'|'nova'|'shimmer'
                           // ElevenLabs: voice_id string
  model?: string;          // OpenAI: 'tts-1'|'tts-1-hd'  ElevenLabs: model_id
  speed?: number;          // OpenAI 0.25–4.0, default 1.0
  filename?: string;
}

async function generateOpenAI(spec: TtsSpec, workspacePath: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const mp3 = await client.audio.speech.create({
    model: (spec.model ?? 'tts-1') as 'tts-1' | 'tts-1-hd',
    voice: (spec.voice ?? 'alloy') as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: spec.text,
    speed: spec.speed ?? 1.0,
    response_format: 'mp3',
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  const filename = `${spec.filename ?? 'speech'}.mp3`;
  const filepath = path.join(workspacePath, filename);
  await fs.writeFile(filepath, buffer);
  return filepath;
}

async function generateElevenLabs(spec: TtsSpec, workspacePath: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const voiceId = spec.voice ?? '21m00Tcm4TlvDq8ikWAM'; // Rachel (default)
  const modelId = spec.model ?? 'eleven_turbo_v2';

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: spec.text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = `${spec.filename ?? 'speech'}.mp3`;
  const filepath = path.join(workspacePath, filename);
  await fs.writeFile(filepath, buffer);
  return filepath;
}

export class TtsGenerator {
  async generate(spec: TtsSpec, workspacePath: string): Promise<string> {
    if (process.env.ELEVENLABS_API_KEY) {
      return generateElevenLabs(spec, workspacePath);
    }
    return generateOpenAI(spec, workspacePath);
  }
}
