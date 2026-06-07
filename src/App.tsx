import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useWebSocket } from './hooks/useWebSocket';
import SubtitleOverlay from './components/SubtitleOverlay';
import TranslationHistory from './components/TranslationHistory';
import type { SubtitleEntry, CorrectionEvent } from './components/SubtitleOverlay';

const WS_URL = `ws://${window.location.hostname}:3000`;

const TARGET_LABELS: Record<string, string> = {
  'en-US': '中文',
  'ja-JP': '中文',
  'ko-KR': '中文',
  'zh-CN': 'English',
};

function App() {
  const [language, setLanguage] = useState('en-US');
  const [subtitleEntries, setSubtitleEntries] = useState<SubtitleEntry[]>([]);
  const [corrections, setCorrections] = useState<CorrectionEvent[]>([]);
  const [totalCorrections, setTotalCorrections] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(true);

  const { isConnected, lastMessage, sendMessage } = useWebSocket(WS_URL);
  const {
    isListening, isSupported, status,
    start: startRecognition, stop: stopRecognition
  } = useSpeechRecognition(language);

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

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
      case 'reset_ack': {
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

  const handleStart = useCallback(() => {
    startRecognition(
      (text: string) => {
        const id = 'interim-current';
        sendMessageRef.current({ type: 'interim', id, text, sourceLanguage: language });
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
      (text: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        sendMessageRef.current({ type: 'final', id, text, sourceLanguage: language });
        setSubtitleEntries((prev) => prev.filter((e) => e.id !== 'interim-current'));
      }
    );
  }, [startRecognition, language]);

  const handleReset = useCallback(() => {
    if (isListening) stopRecognition();
    sendMessageRef.current({ type: 'reset' });
    setSubtitleEntries([]);
    setCorrections([]);
    setTotalCorrections(0);
  }, [isListening, stopRecognition]);

  const stats = useMemo(() => ({
    totalCorrections,
    totalTranslations: subtitleEntries.filter((e) => e.mode === 'final').length
  }), [totalCorrections, subtitleEntries]);

  const targetLabel = TARGET_LABELS[language] || '中文';

  return (
    <main className="app-shell">
      {/* ── Compact Control Bar ── */}
      <header className="control-bar">
        <div className="control-brand">
          <span className="brand-dot" />
          AI 同声传译
        </div>

        <div className="lang-pair">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={isListening}
          >
            <option value="en-US">English</option>
            <option value="ja-JP">日本語</option>
            <option value="ko-KR">한국어</option>
            <option value="zh-CN">中文</option>
          </select>
          <span className="lang-arrow">→</span>
          <span className="lang-target">{targetLabel}</span>
        </div>
        {isListening && <span className="lang-locked-hint">停止后可切换</span>}

        <div className="control-status">
          <span className="status-chip">
            <span className={`dot ${isConnected ? 'online' : 'offline'}`} />
            {isConnected ? 'AI 已连接' : '连接中'}
          </span>
          <span className="status-chip">
            <span className={`dot ${isListening ? 'online' : 'idle'}`} />
            {isListening ? status : (isSupported ? '待机' : '需 Chrome')}
          </span>
        </div>

        <div className="control-actions">
          <button
            onClick={isListening ? stopRecognition : handleStart}
            className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
            disabled={!isSupported}
          >
            {isListening ? '⏹ 停止' : '🎤 开始翻译'}
          </button>
          <button
            onClick={handleReset}
            className="btn btn-ghost"
            disabled={isListening}
          >
            📄 新建
          </button>
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
        isOpen={historyOpen}
        onToggle={() => setHistoryOpen((v) => !v)}
      />
    </main>
  );
}

export default App;
