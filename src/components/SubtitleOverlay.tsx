import { useEffect, useState } from 'react';

interface SubtitleEntry {
  id: string;
  source: string;
  translation: string;
  mode: 'interim' | 'final';
  confidence: number;
  timestamp: number;
  sentiment?: SentimentInfo;
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

function confidenceLabel(score: number) {
  if (score >= 80) return 'conf-high';
  if (score >= 60) return 'conf-mid';
  return 'conf-low';
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function SubtitleOverlay({ entries, corrections, isConnected }: SubtitleOverlayProps) {
  const [correctionMap, setCorrectionMap] = useState<Map<string, CorrectionEvent>>(new Map());
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (corrections.length === 0) return;
    const latest = corrections[corrections.length - 1];
    setCorrectionMap((prev) => new Map([...prev, [latest.id, latest]]));
    setFlashingIds((prev) => new Set([...prev, latest.id]));
    const timer = setTimeout(() => {
      setFlashingIds((prev) => { const n = new Set(prev); n.delete(latest.id); return n; });
    }, 2000);
    return () => clearTimeout(timer);
  }, [corrections]);

  // Latest final entry for the main dual-panel display
  const finalEntries = entries.filter((e) => e.mode === 'final');
  const currentFinal = finalEntries[finalEntries.length - 1];
  const interimEntry = entries.find((e) => e.id === 'interim-current');
  const previousFinals = finalEntries.slice(-4, -1); // 3 before the current one

  // Empty state
  if (!currentFinal && !interimEntry) {
    return (
      <div className="dual-panel">
        <div className="panel panel-source">
          <div className="panel-header">
            <span className="panel-label">源语言</span>
          </div>
          <div className="panel-empty">
            <span className="pulse" />
            等待语音输入...
          </div>
        </div>
        <div className="panel panel-target">
          <div className="panel-header">
            <span className="panel-label">译文</span>
          </div>
          <div className="panel-empty">
            {isConnected ? '准备就绪' : 'AI 引擎连接中...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dual-panel">
      {/* ── Left: Source ── */}
      <div className="panel panel-source">
        <div className="panel-header">
          <span className="panel-label">源语言</span>
          {interimEntry && <span className="panel-badge badge-interim">识别中</span>}
        </div>
        <div className="panel-body">
          {/* Previous source entries */}
          {previousFinals.map((e) => (
            <div key={e.id} className="subtitle-block">
              <p className="subtitle-text">{e.source}</p>
              <div className="subtitle-meta">{formatTime(e.timestamp)}</div>
            </div>
          ))}
          {/* Current final source */}
          {currentFinal && (
            <div className="subtitle-block current-source">
              <p className="subtitle-text">{currentFinal.source}</p>
              <div className="subtitle-meta">{formatTime(currentFinal.timestamp)}</div>
            </div>
          )}
          {/* Interim source (live) */}
          {interimEntry && (
            <div className="subtitle-block current-source">
              <p className="subtitle-text" style={{ opacity: 0.75 }}>{interimEntry.source}</p>
              <div className="subtitle-meta">正在听写...</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Translation ── */}
      <div className="panel panel-target">
        <div className="panel-header">
          <span className="panel-label">中文译文</span>
          {currentFinal && (
            <span className={`confidence-dot ${confidenceLabel(currentFinal.confidence)}`}>
              {currentFinal.confidence}%
            </span>
          )}
        </div>
        <div className="panel-body">
          {/* Previous translations */}
          {previousFinals.map((e) => {
            const corr = correctionMap.get(e.id);
            const isFlash = flashingIds.has(e.id);
            return (
              <div key={e.id} className={`subtitle-block ${isFlash ? 'flash-correct' : ''}`}>
                <p className="subtitle-text">
                  {corr ? corr.newTranslation : e.translation}
                </p>
                {corr && (
                  <div className="correction-block">
                    <p className="old-line">{corr.oldTranslation}</p>
                    <p className="new-line">{corr.newTranslation}</p>
                    <p className="reason-line">{corr.reason}</p>
                  </div>
                )}
                <div className="subtitle-meta">
                  {formatTime(e.timestamp)}
                  <span className={`confidence-dot ${confidenceLabel(e.confidence)}`}>
                    {e.confidence}%
                  </span>
                </div>
              </div>
            );
          })}
          {/* Current final translation */}
          {currentFinal && (() => {
            const corr = correctionMap.get(currentFinal.id);
            const isFlash = flashingIds.has(currentFinal.id);
            return (
              <div key={currentFinal.id} className={`subtitle-block current-target ${isFlash ? 'flash-correct' : ''}`}>
                <p className="subtitle-text">
                  {corr ? corr.newTranslation : currentFinal.translation}
                </p>
                {corr && (
                  <div className="correction-block">
                    <p className="old-line">{corr.oldTranslation}</p>
                    <p className="new-line">{corr.newTranslation}</p>
                    <p className="reason-line">{corr.reason}</p>
                  </div>
                )}
                <div className="subtitle-meta">
                  {formatTime(currentFinal.timestamp)}
                  <span className={`confidence-dot ${confidenceLabel(currentFinal.confidence)}`}>
                    {currentFinal.confidence}%
                  </span>
                </div>
              </div>
            );
          })()}
          {/* Interim translation (live) */}
          {interimEntry && (
            <div className="subtitle-block current-target" style={{ opacity: 0.7 }}>
              <p className="subtitle-text">{interimEntry.translation}</p>
              <div className="subtitle-meta">
                <span className="panel-badge badge-interim">实时</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubtitleOverlay;
export type { SubtitleEntry, CorrectionEvent };
