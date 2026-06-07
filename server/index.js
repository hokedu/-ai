import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { TranslationEngine } from './translate.js';
import { CorrectionEngine } from './correction.js';
import { STTEngine } from './stt.js';

const PORT = process.env.PORT || 3000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY not configured. Set it in .env file.');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

const translateEngine = new TranslationEngine(DEEPSEEK_API_KEY);
const correctionEngine = new CorrectionEngine();
const sttEngine = new STTEngine();

console.log(`STT: ${sttEngine.isEnabled() ? 'enabled' : 'not configured (system audio mode unavailable)'}`);

/**
 * Convert raw PCM16 (16kHz mono) to WAV format for STT API.
 */
function pcm16ToWav(pcmBuffer, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = Buffer.alloc(totalSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(totalSize - 8, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);        // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20);          // AudioFormat (PCM = 1)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, 44);

  return buffer;
}

/**
 * Shared pipeline: context-window translation + confidence + history + correction.
 * Eliminates duplication between mic-STT (final) and system-audio-STT paths.
 *
 * @param {WebSocket} ws
 * @param {object} session
 * @param {string} text - source text to translate
 * @param {string} id - unique entry identifier
 * @param {string} sourceLang - BCP-47 language tag (e.g. 'en-US')
 */
async function translateAndBroadcast(ws, session, text, id, sourceLang) {
  session.contextWindow.push(text);
  if (session.contextWindow.length > 8) {
    session.contextWindow.shift();
  }

  const translation = await translateEngine.translateWithContext(
    text,
    session.contextWindow.slice(0, -1),
    sourceLang
  );

  const confidence = translateEngine.estimateConfidence(text, translation);

  const entry = { id, source: text, translation, timestamp: Date.now(), confidence };
  session.history.push(entry);

  ws.send(JSON.stringify({
    type: 'translation',
    mode: 'final',
    id, source: text, translation, confidence,
    timestamp: entry.timestamp
  }));

  // Fire sentiment analysis asynchronously (non-blocking, ~300ms latency).
  // Sentiment drives UI emotion tags and TTS voice modulation.
  translateEngine.analyzeSentiment(text, sourceLang).then((sentiment) => {
    if (sentiment) {
      ws.send(JSON.stringify({ type: 'sentiment', id, ...sentiment, timestamp: Date.now() }));
    }
  }).catch((err) => {
    console.error('Sentiment analysis failed:', err.message);
  });

  if (session.history.length >= 2) {
    const corrections = await correctionEngine.checkAndCorrect(
      session.history,
      session.contextWindow,
      translateEngine,
      sourceLang
    );

    for (const c of corrections) {
      ws.send(JSON.stringify({
        type: 'correction',
        id: c.id,
        oldTranslation: c.oldTranslation,
        newTranslation: c.newTranslation,
        reason: c.reason,
        timestamp: Date.now()
      }));
    }
  }
}

/**
 * Process accumulated system-audio buffer: PCM→WAV→STT→translate→broadcast.
 */
async function processAudioBuffer(ws, session) {
  if (!sttEngine.isEnabled() || session.audioBuffer.length === 0) {
    session.audioBuffer = Buffer.alloc(0);
    return;
  }

  const pcmBuffer = session.audioBuffer;
  session.audioBuffer = Buffer.alloc(0);

  try {
    const wavBuffer = pcm16ToWav(pcmBuffer);
    const lang = session.audioLanguage || 'en';

    const text = await sttEngine.transcribe(wavBuffer, lang);
    if (!text || text.trim().length === 0) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceLang = session.sourceLanguage || 'en-US';

    await translateAndBroadcast(ws, session, text, id, sourceLang);
  } catch (err) {
    console.error('Audio processing error:', err.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: `STT failed: ${err.message}`
    }));
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  const session = {
    history: [],
    contextWindow: [],
    interimCache: null,
    audioBuffer: Buffer.alloc(0),
    audioLanguage: null,
    audioSilenceSince: 0,
  };

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'interim': {
          if (!msg.text) break;
          const sourceLang = msg.sourceLanguage || 'en-US';
          session.sourceLanguage = sourceLang;
          session.interimCache = msg.text;
          const quick = await translateEngine.translateQuick(msg.text, sourceLang);
          ws.send(JSON.stringify({
            type: 'translation',
            mode: 'interim',
            id: msg.id,
            source: msg.text,
            translation: quick,
            timestamp: Date.now()
          }));
          break;
        }

        case 'final': {
          if (!msg.text) break;
          const source = msg.text;
          const id = msg.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const sourceLang = msg.sourceLanguage || session.sourceLanguage || 'en-US';
          session.sourceLanguage = sourceLang;

          await translateAndBroadcast(ws, session, source, id, sourceLang);
          session.interimCache = null;
          break;
        }

        case 'reset': {
          session.history = [];
          session.contextWindow = [];
          session.interimCache = null;
          session.sourceLanguage = null;
          session.audioBuffer = Buffer.alloc(0);
          session.audioLanguage = null;
          ws.send(JSON.stringify({ type: 'reset_ack', timestamp: Date.now() }));
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }

        case 'audio-start': {
          // Initialize audio capture session
          session.audioBuffer = Buffer.alloc(0);
          session.audioLanguage = msg.language || 'en';
          session.sourceLanguage = msg.language || 'en';
          ws.send(JSON.stringify({ type: 'audio-ready', timestamp: Date.now() }));
          break;
        }

        case 'audio-chunk': {
          // Accumulate base64-encoded PCM16 audio chunks
          if (!msg.data) break;
          const chunk = Buffer.from(msg.data, 'base64');
          session.audioBuffer = Buffer.concat([session.audioBuffer, chunk]);

          // Process when we have ~3 seconds of audio (16kHz mono 16-bit = 32000 bytes/s)
          const minBytes = 32000 * 3; // 3 seconds
          if (session.audioBuffer.length >= minBytes) {
            await processAudioBuffer(ws, session);
          }
          break;
        }

        case 'audio-end': {
          // Process remaining audio on pause/silence
          if (session.audioBuffer.length > 16000) { // at least 0.5s
            await processAudioBuffer(ws, session);
          }
          break;
        }

        default:
          console.warn('Unknown message type:', msg.type);
      }
    } catch (err) {
      console.error('Message error:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: err.message || 'Translation failed'
      }));
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
});

server.listen(PORT, () => {
  console.log(`\nAI Simultaneous Translation Server`);
  console.log(`HTTP: http://localhost:${PORT}`);
  console.log(`WS:   ws://localhost:${PORT}`);
  console.log(`Model: ${process.env.DEEPSEEK_MODEL || 'deepseek-chat'}\n`);
});
