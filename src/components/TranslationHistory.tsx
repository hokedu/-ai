import type { SubtitleEntry, CorrectionEvent } from './SubtitleOverlay';

interface TranslationHistoryProps {
  entries: SubtitleEntry[];
  corrections: CorrectionEvent[];
  stats: { totalCorrections: number; totalTranslations: number };
  isOpen: boolean;
  onToggle: () => void;
}

function TranslationHistory({ entries, corrections, stats, isOpen, onToggle }: TranslationHistoryProps) {
  const completedEntries = entries.filter((e) => e.mode === 'final').reverse();
  const correctionMap = new Map<string, CorrectionEvent>();
  for (const c of corrections) correctionMap.set(c.id, c);

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
              return (
                <li key={entry.id} className={correction ? 'corrected' : ''}>
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
                  {correction && (
                    <div className="history-correction-row">
                      <span className="corr-icon">✎</span>
                      <div>
                        <p className="corr-old">{correction.oldTranslation}</p>
                        <p className="corr-reason">{correction.reason}</p>
                      </div>
                    </div>
                  )}
                  <div className="history-meta-row">
                    <span>置信度 {entry.confidence}%</span>
                    <span>{new Date(entry.timestamp).toLocaleTimeString('zh-CN')}</span>
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
