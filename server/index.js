import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { TranslationEngine } from './translate.js';
import { CorrectionEngine } from './correction.js';

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

wss.on('connection', (ws) => {
  console.log('Client connected');
  const session = {
    history: [],
    contextWindow: [],
    interimCache: null
  };

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'interim': {
          session.interimCache = msg.text;
          const quick = await translateEngine.translateQuick(msg.text);
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
          const source = msg.text;
          const id = msg.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          session.contextWindow.push(source);
          if (session.contextWindow.length > 8) {
            session.contextWindow.shift();
          }

          const translation = await translateEngine.translateWithContext(
            source,
            session.contextWindow.slice(0, -1)
          );

          const confidence = translateEngine.estimateConfidence(source, translation);

          const entry = { id, source, translation, timestamp: Date.now(), confidence };
          session.history.push(entry);

          ws.send(JSON.stringify({
            type: 'translation',
            mode: 'final',
            id, source, translation, confidence,
            timestamp: entry.timestamp
          }));

          if (session.history.length >= 2) {
            const corrections = await correctionEngine.checkAndCorrect(
              session.history,
              session.contextWindow,
              translateEngine
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

          session.interimCache = null;
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
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
