/**
 * ImageGenerator — Generates images via DALL-E 3 or Replicate.
 *
 * Provider selection:
 *   REPLICATE_API_TOKEN set → uses Replicate (Flux Schnell by default)
 *   Otherwise              → uses DALL-E 3 via OpenAI
 *
 * The image is downloaded and saved to workspacePath/<filename>.png
 */

import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';

export interface ImageSpec {
  prompt: string;
  model?: string;     // 'dall-e-3' | 'dall-e-2' | replicate model slug
  size?: '1024x1024' | '1792x1024' | '1024x1792' | '512x512' | '256x256';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  filename?: string;
  n?: number;
}

async function downloadToFile(url: string, filepath: string): Promise<void> {
  const proto = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    proto.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', async () => {
        await fs.writeFile(filepath, Buffer.concat(chunks));
        resolve();
      });
      res.on('error', reject);
    });
  });
}

async function generateReplicate(
  spec: ImageSpec,
  workspacePath: string,
): Promise<string[]> {
  const token = process.env.REPLICATE_API_TOKEN!;
  const modelSlug = spec.model ?? 'black-forest-labs/flux-schnell';

  // Start prediction
  const startRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: undefined,
      model: modelSlug,
      input: {
        prompt: spec.prompt,
        num_outputs: spec.n ?? 1,
        aspect_ratio: spec.size === '1792x1024' ? '16:9' : '1:1',
      },
    }),
  });

  let prediction = await startRes.json() as { id: string; status: string; output?: string[] };

  // Poll until done
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Token ${token}` } },
    );
    prediction = await poll.json() as typeof prediction;
  }

  if (prediction.status === 'failed' || !prediction.output) {
    throw new Error('Replicate image generation failed');
  }

  const paths: string[] = [];
  for (let i = 0; i < prediction.output.length; i++) {
    const url = prediction.output[i];
    const filename = `${spec.filename ?? 'image'}_${i + 1}.webp`;
    const filepath = path.join(workspacePath, filename);
    await downloadToFile(url, filepath);
    paths.push(filepath);
  }
  return paths;
}

async function generateDalle(spec: ImageSpec, workspacePath: string): Promise<string[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.images.generate({
    model: (spec.model ?? 'dall-e-3') as 'dall-e-3' | 'dall-e-2',
    prompt: spec.prompt,
    n: spec.n ?? 1,
    size: spec.size ?? '1024x1024',
    quality: spec.quality ?? 'standard',
    style: spec.style ?? 'vivid',
    response_format: 'url',
  });

  const paths: string[] = [];
  for (let i = 0; i < (response.data?.length ?? 0); i++) {
    const url = response.data[i].url!;
    const filename = `${spec.filename ?? 'image'}_${i + 1}.png`;
    const filepath = path.join(workspacePath, filename);
    await downloadToFile(url, filepath);
    paths.push(filepath);
  }
  return paths;
}

export class ImageGenerator {
  async generate(spec: ImageSpec, workspacePath: string): Promise<string[]> {
    if (process.env.REPLICATE_API_TOKEN) {
      return generateReplicate(spec, workspacePath);
    }
    return generateDalle(spec, workspacePath);
  }
}
