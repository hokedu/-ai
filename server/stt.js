import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Speech-to-Text adapter — pluggable backend for audio transcription.
 *
 * Default backend: Generic OpenAI-compatible Whisper API
 * (works with Groq, OpenAI, or any /v1/audio/transcriptions endpoint).
 *
 * Configure via .env:
 *   STT_API_KEY        — API key for the STT service
 *   STT_BASE_URL       — Base URL (e.g. https://api.groq.com/openai)
 *   STT_MODEL          — Model name (default: whisper-large-v3)
 *   STT_LANGUAGE       — Source language hint (default: en)
 */

const TMP_DIR = join(process.cwd(), '.tmp');
if (!existsSync(TMP_DIR)) {
  mkdirSync(TMP_DIR, { recursive: true });
}

export class STTEngine {
  constructor() {
    this.apiKey = process.env.STT_API_KEY || '';
    this.baseUrl = process.env.STT_BASE_URL || 'https://api.groq.com/openai';
    this.model = process.env.STT_MODEL || 'whisper-large-v3';
    this.language = process.env.STT_LANGUAGE || 'en';
    this.enabled = !!this.apiKey;
  }

  isEnabled() {
    return this.enabled;
  }

  /**
   * Transcribe a WAV audio buffer → text.
   * @param {Buffer} wavBuffer - PCM 16-bit mono WAV audio data
   * @param {string} [language] - Language hint (e.g. 'en', 'ja', 'ko', 'zh')
   * @returns {Promise<string>} transcribed text
   */
  async transcribe(wavBuffer, language) {
    if (!this.enabled) {
      throw new Error('STT not configured. Set STT_API_KEY in .env');
    }

    const lang = language || this.language;

    try {
      const formData = new FormData();
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      formData.append('file', blob, 'audio.wav');
      formData.append('model', this.model);
      formData.append('language', lang);
      formData.append('response_format', 'json');

      const response = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`STT API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return (data.text || '').trim();
    } catch (err) {
      console.error('STT transcription failed:', err.message);
      throw err;
    }
  }

  /**
   * Detect voice activity in raw PCM data (simple energy-based VAD).
   * Returns true if the chunk contains speech above the noise floor.
   */
  hasVoiceActivity(pcmBuffer) {
    if (!pcmBuffer || pcmBuffer.length < 2) return false;

    const samples = new Int16Array(
      pcmBuffer.buffer,
      pcmBuffer.byteOffset,
      Math.floor(pcmBuffer.length / 2)
    );

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += (samples[i] / 32768) ** 2;
    }
    const rms = Math.sqrt(sumSquares / samples.length);

    // Threshold: -40 dBFS ≈ 0.01 RMS
    return rms > 0.01;
  }
}
