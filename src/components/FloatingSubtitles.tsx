import { useEffect, useRef, useState } from 'react';
import type { SubtitleEntry } from './SubtitleOverlay';

interface FloatingSubtitlesProps {
  entries: SubtitleEntry[];
  /** Whether the floating window is visible */
  visible: boolean;
  /** Clear all subtitles */
  onClear: () => void;
  /** Save current subtitles to favorites */
  onSave: () => void;
  /** Close the floating window */
  onClose: () => void;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function FloatingSubtitles({ entries, visible, onClear, onSave, onClose }: FloatingSubtitlesProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Only show final entries (not interim)
  const finalEntries = entries.filter((e) => e.mode === 'final');

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (listRef.current && !collapsed) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [finalEntries.length, collapsed]);

  if (!visible) return null;

  return (
    <div className={`floating-subtitles ${collapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="floating-header">
        <span className="floating-title">
          实时字幕
          <span className="floating-count">{finalEntries.length}</span>
        </span>
        <div className="floating-header-actions">
          <button
            className="floating-btn"
            onClick={onClear}
            disabled={finalEntries.length === 0}
            title="清空字幕"
            aria-label="清空字幕"
          >
            🗑️
          </button>
          <button
            className="floating-btn"
            onClick={onSave}
            disabled={finalEntries.length === 0}
            title="保存字幕到我的收藏"
            aria-label="保存字幕"
          >
            💾
          </button>
          <button
            className="floating-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开' : '收起'}
            aria-label={collapsed ? '展开' : '收起'}
          >
            {collapsed ? '□' : '−'}
          </button>
          <button
            className="floating-btn floating-close-btn"
            onClick={onClose}
            title="关闭悬浮窗"
            aria-label="关闭悬浮窗"
          >
            ×
          </button>
        </div>
      </div>

      {/* Subtitle list */}
      {!collapsed && (
        <div className="floating-list" ref={listRef}>
          {finalEntries.length === 0 ? (
            <p className="floating-empty">等待翻译结果...</p>
          ) : (
            finalEntries.map((entry) => (
              <div key={entry.id} className="floating-item">
                <span className="floating-time">{formatTime(entry.timestamp)}</span>
                <p className="floating-text">{entry.translation}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Collapsed indicator */}
      {collapsed && finalEntries.length > 0 && (
        <div className="floating-collapsed-hint">
          最新: {finalEntries[finalEntries.length - 1]?.translation?.slice(0, 30)}...
        </div>
      )}
    </div>
  );
}

export default FloatingSubtitles;
