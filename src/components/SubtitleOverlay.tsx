import { useEffect, useState } from 'react';

interface SubtitleEntry {
  id: string;
  source: string;
  translation: string;
  mode: 'interim' | 'final';
  confidence: number;
  timestamp: number;
}

interface CorrectionEvent {
  id: string;
  oldTranslation: string;
  newTranslation: string;
  reason: string;
  timestamp: number;
}

interface SubtitleOverlayProps {
  entries: SubtitleEntry[];
  corrections: CorrectionEvent[];
  isConnected: boolean;
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
  return (
    <span className="confidence-bar">
      <span style={{ width: `${score}%`, backgroundColor: color }} />
    </span>
  );
}

function SubtitleOverlay({ entries, corrections, isConnected }: SubtitleOverlayProps) {
  const [correctedIds, setCorrectedIds] = useState<Set<string>>(new Set());
  const [correctedTexts, setCorrectedTexts] = useState<Map<string, string>>(new Map());
  const [correctionReasons, setCorrectionReasons] = useState<Map<string, string>>(new Map());
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (corrections.length === 0) return;
    const latest = corrections[corrections.length - 1];
    setCorrectedIds((prev) => new Set([...prev, latest.id]));
    setCorrectedTexts((prev) => new Map([...prev, [latest.id, latest.newTranslation]]));
    setCorrectionReasons((prev) => new Map([...prev, [latest.id, latest.reason]]));
    setFlashingIds((prev) => new Set([...prev, latest.id]));
    const timer = setTimeout(() => {
      setFlashingIds((prev) => { const n = new Set(prev); n.delete(latest.id); return n; });
    }, 2000);
    return () => clearTimeout(timer);
  }, [corrections]);

  const visible = entries.slice(-3);

  if (entries.length === 0) {
    return (
      <div className="subtitle-overlay empty">
        <div className="subtitle-placeholder">
          <span className="pulse-dot" /> 等待语音输入...
        </div>
      </div>
    );
  }

  return (
    <div className="subtitle-overlay">
      <div className="subtitle-header">
        <span className={`ws-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'AI 同声传译中' : '连接中...'}
        </span>
      </div>
      <div className="subtitle-stream">
        {visible.map((entry) => {
          const isCorrected = correctedIds.has(entry.id);
          const correctedText = correctedTexts.get(entry.id);
          const reason = correctionReasons.get(entry.id);
          const isFlashing = flashingIds.has(entry.id);

          return (
            <div key={entry.id}
              className={`subtitle-item ${entry.mode} ${isCorrected ? 'corrected' : ''} ${isFlashing ? 'flash-correct' : ''}`}>
              <div className="subtitle-source">
                <span className="lang-tag">EN</span> {entry.source}
              </div>
              <div className="subtitle-translation">
                <span className="lang-tag">中文</span>
                <span className={isCorrected ? 'corrected-text' : ''}>
                  {isCorrected ? (
                    <>
                      <span className="old-text">{entry.translation}</span>
                      <span className="arrow">→</span>
                      <span className="new-text">{correctedText}</span>
                    </>
                  ) : entry.translation}
                </span>
                {entry.mode === 'final' && <ConfidenceBar score={entry.confidence} />}
                {entry.mode === 'interim' && <span className="interim-badge">识别中</span>}
              </div>
              {isCorrected && reason && <div className="correction-reason">{reason}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SubtitleOverlay;
export type { SubtitleEntry, CorrectionEvent };
