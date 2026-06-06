import type { SubtitleEntry, CorrectionEvent } from './SubtitleOverlay';

interface TranslationHistoryProps {
  entries: SubtitleEntry[];
  corrections: CorrectionEvent[];
  stats: { totalCorrections: number; totalTranslations: number };
}

function TranslationHistory({ entries, corrections, stats }: TranslationHistoryProps) {
  const completedEntries = entries.filter((e) => e.mode === 'final').reverse();
  const correctionMap = new Map<string, CorrectionEvent>();
  for (const c of corrections) correctionMap.set(c.id, c);

  if (completedEntries.length === 0) {
    return (
      <div className="history-panel">
        <h2>翻译历史</h2>
        <p className="history-empty">还没有完整的翻译内容，开始说话吧</p>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-header">
        <h2>翻译历史</h2>
        <div className="history-stats">
          <span>{stats.totalTranslations} 条翻译</span>
          {stats.totalCorrections > 0 && (
            <span className="correction-stat">{stats.totalCorrections} 次自动修正</span>
          )}
        </div>
      </div>
      <ul className="history-list">
        {completedEntries.map((entry) => {
          const correction = correctionMap.get(entry.id);
          return (
            <li key={entry.id} className={correction ? 'corrected' : ''}>
              <div className="history-source">
                <span className="lang-tag small">EN</span>
                <p>{entry.source}</p>
              </div>
              <div className="history-translation">
                <span className="lang-tag small">中文</span>
                <p>{correction ? correction.newTranslation : entry.translation}</p>
              </div>
              {correction && (
                <div className="history-correction">
                  <span className="correction-icon">✎</span>
                  <div>
                    <p className="old">原译文: {correction.oldTranslation}</p>
                    <p className="reason">{correction.reason}</p>
                  </div>
                </div>
              )}
              <div className="history-meta">
                <span>置信度: {entry.confidence}%</span>
                <span>{new Date(entry.timestamp).toLocaleTimeString('zh-CN')}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default TranslationHistory;
