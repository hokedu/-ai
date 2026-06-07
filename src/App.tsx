import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useWebSocket } from './hooks/useWebSocket';
import SubtitleOverlay from './components/SubtitleOverlay';
import TranslationHistory from './components/TranslationHistory';
import type { SubtitleEntry, CorrectionEvent } from './components/SubtitleOverlay';

const WS_URL = `ws://${window.location.hostname}:3000`;

function App() {
  const [language, setLanguage] = useState('en-US');
  const [subtitleEntries, setSubtitleEntries] = useState<SubtitleEntry[]>([]);
  const [corrections, setCorrections] = useState<CorrectionEvent[]>([]);
  const [totalCorrections, setTotalCorrections] = useState(0);

  const { isConnected, lastMessage, sendMessage } = useWebSocket(WS_URL);
  const {
    isListening, isSupported, status,
    start: startRecognition, stop: stopRecognition
  } = useSpeechRecognition(language);

  // Stable ref so callbacks passed to startRecognition always have latest sendMessage
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // Process WebSocket messages from AI backend
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'translation': {
        const entry: SubtitleEntry = {
          id: lastMessage.id || `${Date.now()}`,
          source: lastMessage.source || '',
          translation: lastMessage.translation || '',
          mode: (lastMessage.mode as 'interim' | 'final') || 'final',
          confidence: lastMessage.confidence || 85,
          timestamp: lastMessage.timestamp || Date.now()
        };
        setSubtitleEntries((prev) => {
          const idx = prev.findIndex((e) => e.id === entry.id);
          if (idx >= 0) { const u = [...prev]; u[idx] = entry; return u; }
          return [...prev, entry];
        });
        break;
      }
      case 'correction': {
        const correction: CorrectionEvent = {
          id: lastMessage.id || '',
          oldTranslation: lastMessage.oldTranslation || '',
          newTranslation: lastMessage.newTranslation || '',
          reason: lastMessage.reason || '自动修正',
          timestamp: lastMessage.timestamp || Date.now()
        };
        setCorrections((prev) => [...prev, correction]);
        setTotalCorrections((c) => c + 1);
        setSubtitleEntries((prev) =>
          prev.map((e) =>
            e.id === correction.id
              ? { ...e, translation: correction.newTranslation, confidence: Math.min(100, e.confidence + 10) }
              : e
          )
        );
        break;
      }
    }
  }, [lastMessage]);

  // Start recognition — callbacks wired directly, no ref timing issues
  const handleStart = useCallback(() => {
    startRecognition(
      // onInterim
      (text: string) => {
        const id = 'interim-current';
        sendMessageRef.current({ type: 'interim', id, text });
        setSubtitleEntries((prev) => {
          const entry: SubtitleEntry = {
            id, source: text, translation: '识别中...',
            mode: 'interim', confidence: 50, timestamp: Date.now()
          };
          const idx = prev.findIndex((e) => e.id === id);
          if (idx >= 0) { const u = [...prev]; u[idx] = entry; return u; }
          return [...prev, entry];
        });
      },
      // onFinal
      (text: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        sendMessageRef.current({ type: 'final', id, text });
        setSubtitleEntries((prev) => prev.filter((e) => e.id !== 'interim-current'));
      }
    );
  }, [startRecognition]);

  const stats = useMemo(() => ({
    totalCorrections,
    totalTranslations: subtitleEntries.filter((e) => e.mode === 'final').length
  }), [totalCorrections, subtitleEntries]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <p className="eyebrow">AI 同声传译助手</p>
          <h1>实时语音识别 + AI翻译 + 自动修正</h1>
          <p className="description">
            基于 DeepSeek 大模型的上下文感知翻译引擎，支持实时纠错与术语一致性保证
          </p>
        </div>
        <div className="header-right">
          <div className="status-card">
            <div className="status-row">
              <span className={`dot ${isConnected ? 'green' : 'red'}`} />
              <span>{isConnected ? 'AI 引擎已连接' : 'AI 引擎连接中...'}</span>
            </div>
            <div className="status-row">
              <span className={`dot ${isListening ? 'green' : 'gray'}`} />
              <span>{isListening ? status : '待机'}</span>
            </div>
            <div className="status-row">
              <span>语音识别：{isSupported ? '✓ Chrome' : '✗ 请使用 Chrome'}</span>
            </div>
          </div>
          <div className="header-actions">
            <button
              onClick={isListening ? stopRecognition : handleStart}
              className={`primary ${isListening ? 'danger' : ''}`}
              disabled={!isSupported}
            >
              {isListening ? '⏹ 停止翻译' : '🎤 开始翻译'}
            </button>
          </div>
          <div className="lang-selector">
            <label>
              源语言：
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en-US">English</option>
                <option value="ja-JP">日本語</option>
                <option value="ko-KR">한국어</option>
                <option value="zh-CN">中文</option>
              </select>
            </label>
          </div>
        </div>
      </header>

      <SubtitleOverlay
        entries={subtitleEntries}
        corrections={corrections}
        isConnected={isConnected}
      />

      <TranslationHistory
        entries={subtitleEntries}
        corrections={corrections}
        stats={stats}
      />
    </main>
  );
}

export default App;
