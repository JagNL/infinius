/**
 * @infinius/media
 *
 * Media generation + transcription.
 *
 * ImageGenerator   — DALL-E 3 (default) or Replicate (Flux/SD) via REPLICATE_API_TOKEN
 * TtsGenerator     — OpenAI TTS (tts-1/tts-1-hd) or ElevenLabs (ELEVENLABS_API_KEY)
 * Transcriber      — OpenAI Whisper (whisper-1) for audio/video → text
 *
 * All generators save output to the workspace and return the file path,
 * matching the share_file tool's expected input.
 */

export { ImageGenerator, type ImageSpec } from './image-generator.js';
export { TtsGenerator, type TtsSpec } from './tts-generator.js';
export { Transcriber, type TranscribeSpec } from './transcriber.js';
