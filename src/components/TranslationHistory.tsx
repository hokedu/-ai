import { useState } from 'react';
import { useTTS } from '../hooks/useTTS';
import type { SubtitleEntry, CorrectionEvent } from './SubtitleOverlay';

interface TranslationHistoryProps {
  entries: SubtitleEntry[];
  corrections: CorrectionEvent[];
  stats: { totalCorrections: number; totalTranslations: number };
  isOpen: boolean;
  onToggle: () => void;
  sourceLanguage: string;
}

const EMOTION_EMOJI: Record<string, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😡',
  urgent: '😰',
  calm: '😌',
  neutral: '😐',
  excited: '🤩',
  confused: '🤔',
};

const EMOTION_LABEL: Record<string, string> = {
  happy: '开心',
  sad: '悲伤',
  angry: '愤怒',
  urgent: '紧迫',
  calm: '平静',
  neutral: '中性',
  excited: '兴奋',
  confused: '困惑',
};

function TranslationHistory({ entries, corrections, stats, isOpen, onToggle, sourceLanguage }: TranslationHistoryProps) {
  const { isSpeaking, speak, stop } = useTTS();
  const [playingId, setPlayingId] = useState<string | null>(null);

  const completedEntries = entries.filter((e) => e.mode === 'final').reverse();
  const correctionMap = new Map<string, CorrectionEvent>();
  for (const c of corrections) correctionMap.set(c.id, c);

  const handlePlay = (entry: SubtitleEntry) => {
    if (playingId === entry.id && isSpeaking) {
      stop();
      setPlayingId(null);
      return;
    }
    setPlayingId(entry.id);
    const translationText = correctionMap.get(entry.id)?.newTranslation || entry.translation;
    speak(translationText, sourceLanguage, entry.sentiment);
  };

  return (
    <div className="history-panel">
      <button className="history-toggle" onClick={onToggle} aria-expanded={isOpen}>
        <span>
          翻译历史
          <span className="history-stats-inline">
            <span>{stats.totalTranslations} 条</span>
            {stats.totalCorrections > 0 && (
              <span className="corr-count">{stats.totalCorrections} 次修正</span>
            )}
          </span>
        </span>
        <span className={`chevron ${isOpen ? 'open' : ''}`}>▼</span>
      </button>

      <div className={`history-body ${isOpen ? 'open' : ''}`}>
        {completedEntries.length === 0 ? (
          <p className="history-empty-state">还没有翻译内容，开始说话吧</p>
        ) : (
          <ul className="history-list">
            {completedEntries.map((entry) => {
              const correction = correctionMap.get(entry.id);
              const isEntryPlaying = playingId === entry.id && isSpeaking;
              return (
                <li key={entry.id}>
                  <div className="history-source-side">
                    <span className="history-side-label">原文</span>
                    <p className="history-side-text">{entry.source}</p>
                  </div>
                  <div className="history-target-side">
                    <span className="history-side-label">译文</span>
                    <p className="history-side-text">
                      {correction ? correction.newTranslation : entry.translation}
                    </p>
                  </div>
                  <div className="history-meta-row">
                    <div className="history-meta-left">
                      <span>置信度 {entry.confidence}%</span>
                      {entry.sentiment && (
                        <span className="sentiment-tag" title={`${EMOTION_LABEL[entry.sentiment.emotion]} · 强度 ${Math.round(entry.sentiment.intensity * 100)}%`}>
                          {EMOTION_EMOJI[entry.sentiment.emotion] || '😐'}
                          {' '}{EMOTION_LABEL[entry.sentiment.emotion] || '中性'}
                        </span>
                      )}
                    </div>
                    <div className="history-meta-right">
                      <span>{new Date(entry.timestamp).toLocaleTimeString('zh-CN')}</span>
                      <button
                        className={`tts-play-btn ${isEntryPlaying ? 'playing' : ''}`}
                        onClick={() => handlePlay(entry)}
                        title={isEntryPlaying ? '停止朗读' : '一键朗读（情感保留）'}
                        aria-label={isEntryPlaying ? '停止朗读' : '一键朗读'}
                      >
                        {isEntryPlaying ? '⏹' : '🔊'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default TranslationHistory;
