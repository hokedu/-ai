import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSystemAudioCapture } from './hooks/useSystemAudioCapture';
import { useWebSocket } from './hooks/useWebSocket';
import SubtitleOverlay from './components/SubtitleOverlay';
import TranslationHistory from './components/TranslationHistory';
import { usePiPWindow } from './hooks/usePiPWindow';
import type { SubtitleEntry, CorrectionEvent } from './components/SubtitleOverlay';

const WS_PORT = window.location.port || '3000';
const WS_URL = `ws://${window.location.hostname}:${WS_PORT}`;

const TARGET_LABELS: Record<string, string> = {
  'en-US': '中文',
  'ja-JP': '中文',
  'ko-KR': '中文',
  'zh-CN': 'English',
};

interface TranslationFolder {
  id: string;
  name: string;
  entries: SubtitleEntry[];
  corrections: CorrectionEvent[];
  createdAt: number;
}

interface FavoriteCollection {
  id: string;
  name: string;
  entries: SubtitleEntry[];
  createdAt: number;
  summary?: string;
}

function App() {
  const [language, setLanguage] = useState('en-US');
  const [audioSource, setAudioSource] = useState<'mic' | 'system'>('mic');
  const [folders, setFolders] = useState<TranslationFolder[]>([{
    id: 'default',
    name: '默认会话',
    entries: [],
    corrections: [],
    createdAt: Date.now(),
  }]);
  const [selectedFolderId, setSelectedFolderId] = useState('default');
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [historyOpen, setHistoryOpen] = useState(true);

  // ── Floating window state (tracked for PiP sync + favorites) ──
  const [floatingEntries, setFloatingEntries] = useState<SubtitleEntry[]>([]);

  // ── Favorites ──
  const [favorites, setFavorites] = useState<FavoriteCollection[]>([]);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);

  // ── Environment detection ──
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const [electronPipOpen, setElectronPipOpen] = useState(false);

  // Track Electron PiP window close
  useEffect(() => {
    if (!isElectron) return;
    const cleanup = (window as any).electronAPI.onPipClosed(() => {
      setElectronPipOpen(false);
    });
    return cleanup;
  }, [isElectron]);

  const folderMenuRef = useRef<HTMLDivElement>(null);
  const { isConnected, lastMessage, sendMessage } = useWebSocket(WS_URL);
  const {
    isListening, isSupported, status, audioLevel,
    start: startRecognition, stop: stopRecognition
  } = useSpeechRecognition(language);

  const {
    isCapturing, isSupported: sysAudioSupported, status: sysAudioStatus,
    audioLevel: sysAudioLevel,
    start: startSysCapture, stop: stopSysCapture
  } = useSystemAudioCapture();

  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const activeAudioLevel = audioSource === 'system' ? sysAudioLevel : audioLevel;
  const isActive = audioSource === 'system' ? isCapturing : isListening;

  const meterCells = useMemo(() => {
    return Array.from({ length: 8 }, (_, index) => {
      const threshold = Math.pow(index / 7, 1.6) * 0.7 + 0.03;
      const active = activeAudioLevel >= threshold;
      const intensity = active ? Math.min(1, (activeAudioLevel - threshold) / (1 - threshold) + 0.2) : 0;
      return { active, intensity };
    });
  }, [activeAudioLevel]);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? folders[0],
    [folders, selectedFolderId]
  );

  useEffect(() => {
    if (!lastMessage) return;

    // Update folder entries
    setFolders((prevFolders) => {
      return prevFolders.map((folder) => {
        if (folder.id !== selectedFolderId) return folder;

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
            const idx = folder.entries.findIndex((e) => e.id === entry.id);
            const entries = [...folder.entries];
            if (idx >= 0) {
              entries[idx] = entry;
            } else {
              entries.push(entry);
            }
            return { ...folder, entries };
          }
          case 'reset_ack': {
            return folder;
          }
          case 'sentiment': {
            const sentimentInfo: SentimentInfo = {
              emotion: (lastMessage.emotion as SentimentInfo['emotion']) || 'neutral',
              intensity: lastMessage.intensity ?? 0.5,
              confidence: lastMessage.confidence ?? 50,
            };
            return {
              ...folder,
              entries: folder.entries.map((e) =>
                e.id === lastMessage.id ? { ...e, sentiment: sentimentInfo } : e
              ),
            };
          }
          case 'correction': {
            const correction: CorrectionEvent = {
              id: lastMessage.id || '',
              oldTranslation: lastMessage.oldTranslation || '',
              newTranslation: lastMessage.newTranslation || '',
              reason: lastMessage.reason || '自动修正',
              timestamp: lastMessage.timestamp || Date.now()
            };
            const entries = folder.entries.map((e) =>
              e.id === correction.id
                ? { ...e, translation: correction.newTranslation, confidence: Math.min(100, e.confidence + 10) }
                : e
            );
            return { ...folder, entries, corrections: [...folder.corrections, correction] };
          }
          default:
            return folder;
        }
      });
    });

    // Also update floating entries for the floating subtitle window
    setFloatingEntries((prev) => {
      switch (lastMessage.type) {
        case 'translation': {
          if (lastMessage.mode !== 'final') return prev;
          const entry: SubtitleEntry = {
            id: lastMessage.id || `${Date.now()}`,
            source: lastMessage.source || '',
            translation: lastMessage.translation || '',
            mode: 'final',
            confidence: lastMessage.confidence || 85,
            timestamp: lastMessage.timestamp || Date.now()
          };
          const idx = prev.findIndex((e) => e.id === entry.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = entry;
            return next;
          }
          return [...prev, entry];
        }
        case 'correction': {
          return prev.map((e) =>
            e.id === lastMessage.id
              ? { ...e, translation: lastMessage.newTranslation || e.translation, confidence: Math.min(100, e.confidence + 10) }
              : e
          );
        }
        case 'reset_ack': {
          return [];
        }
        default:
          return prev;
      }
    });
  }, [lastMessage, selectedFolderId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderMenuOpen && folderMenuRef.current && !folderMenuRef.current.contains(event.target as Node)) {
        setFolderMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [folderMenuOpen]);

  const handleStart = useCallback(() => {
    if (audioSource === 'system') {
      // Open floating subtitle window
      if (isElectron) {
        (window as any).electronAPI.openPip();
        setElectronPipOpen(true);
      } else {
        pip.open();
      }
      const langMap: Record<string, string> = {
        'en-US': 'en', 'ja-JP': 'ja', 'ko-KR': 'ko', 'zh-CN': 'zh',
      };
      sendMessageRef.current({ type: 'audio-start', language: langMap[language] || 'en' });
      startSysCapture((base64Pcm: string) => {
        sendMessageRef.current({ type: 'audio-chunk', data: base64Pcm });
      });
    } else {
      startRecognition(
        (text: string) => {
          const id = 'interim-current';
          sendMessageRef.current({ type: 'interim', id, text, sourceLanguage: language });
          setFolders((prevFolders) =>
            prevFolders.map((folder) => {
              if (folder.id !== selectedFolderId) return folder;
              const entry: SubtitleEntry = {
                id,
                source: text,
                translation: '识别中...',
                mode: 'interim',
                confidence: 50,
                timestamp: Date.now()
              };
              const entries = [...folder.entries];
              const idx = entries.findIndex((e) => e.id === id);
              if (idx >= 0) {
                entries[idx] = entry;
              } else {
                entries.push(entry);
              }
              return { ...folder, entries };
            })
          );
        },
        (text: string) => {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          sendMessageRef.current({ type: 'final', id, text, sourceLanguage: language });
          setFolders((prevFolders) =>
            prevFolders.map((folder) => {
              if (folder.id !== selectedFolderId) return folder;
              return { ...folder, entries: folder.entries.filter((e) => e.id !== 'interim-current') };
            })
          );
        }
      );
    }
  }, [audioSource, startRecognition, startSysCapture, language, selectedFolderId]);

  const handleReset = useCallback(() => {
    if (isListening) stopRecognition();
    if (isCapturing) stopSysCapture();
    sendMessageRef.current({ type: 'reset' });
    setFolders((prevFolders) =>
      prevFolders.map((folder) =>
        folder.id === selectedFolderId
          ? { ...folder, entries: [], corrections: [] }
          : folder
      )
    );
    setFloatingEntries([]);
  }, [isListening, isCapturing, stopRecognition, stopSysCapture, selectedFolderId]);

  // ── PiP window actions ──
  const handlePiPClear = useCallback(() => {
    setFloatingEntries([]);
  }, []);

  const handlePiPSave = useCallback((entries: SubtitleEntry[]) => {
    if (entries.length === 0) return;
    const id = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const name = `收藏 ${new Date().toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    const collection: FavoriteCollection = {
      id,
      name,
      entries: [...entries],
      createdAt: Date.now(),
    };
    setFavorites((prev) => [...prev, collection]);
  }, []);

  const handlePiPClose = useCallback(() => {
    // PiP window already closed by the user; no extra state needed
  }, []);

  const pip = usePiPWindow(floatingEntries, handlePiPSave, handlePiPClear, handlePiPClose, isElectron);

  // ── Electron mode: sync floating entries to pip window via BroadcastChannel ──
  useEffect(() => {
    if (!isElectron) return;
    const channel = new BroadcastChannel('pip-subtitles');
    channel.postMessage({ type: 'sync', entries: floatingEntries });
    return () => channel.close();
  }, [floatingEntries, isElectron]);

  // ── Electron mode: listen for pip window actions (save/clear/close) ──
  useEffect(() => {
    if (!isElectron) return;
    const channel = new BroadcastChannel('pip-subtitles');
    channel.onmessage = (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'clear':
          setFloatingEntries([]);
          break;
        case 'save':
          handlePiPSave(msg.entries || []);
          break;
        case 'close':
          (window as any).electronAPI?.closePip();
          setElectronPipOpen(false);
          break;
      }
    };
    return () => channel.close();
  }, [isElectron, handlePiPSave]);

  const stats = useMemo(() => ({
    totalCorrections: selectedFolder.corrections.length,
    totalTranslations: selectedFolder.entries.filter((e) => e.mode === 'final').length
  }), [selectedFolder]);

  const createFolder = useCallback(() => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newFolder: TranslationFolder = {
      id,
      name: trimmed,
      entries: [],
      corrections: [],
      createdAt: Date.now(),
    };
    setFolders((prev) => [...prev, newFolder]);
    setSelectedFolderId(id);
    setNewFolderName('');
    setFolderMenuOpen(false);
  }, [newFolderName]);

  const deleteFolder = useCallback((id: string) => {
    setFolders((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((folder) => folder.id !== id);
      if (selectedFolderId === id) {
        setSelectedFolderId(next[0].id);
      }
      return next;
    });
  }, [selectedFolderId]);

  const selectFolder = useCallback((id: string) => {
    if (isListening || isCapturing) return;
    setSelectedFolderId(id);
    setFolderMenuOpen(false);
  }, [isListening, isCapturing]);

  const deleteFavorite = useCallback((id: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleSummarize = useCallback(async (favId: string) => {
    const fav = favorites.find((f) => f.id === favId);
    if (!fav || fav.entries.length === 0) return;

    setSummarizingId(favId);
    try {
      const res = await fetch(`/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: fav.entries.map((e) => ({
            source: e.source,
            translation: e.translation,
            timestamp: e.timestamp,
          })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFavorites((prev) =>
        prev.map((f) => (f.id === favId ? { ...f, summary: data.summary } : f))
      );
    } catch (err) {
      console.error('Summarize failed:', err);
    } finally {
      setSummarizingId(null);
    }
  }, [favorites]);

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
            disabled={isListening || isCapturing}
          >
            <option value="en-US">English</option>
            <option value="ja-JP">日本語</option>
            <option value="ko-KR">한국어</option>
            <option value="zh-CN">中文</option>
          </select>
          <span className="lang-arrow">→</span>
          <span className="lang-target">{targetLabel}</span>
        </div>
        {(isListening || isCapturing) && <span className="lang-locked-hint">停止后可切换</span>}

        <div className="audio-source-toggle">
          <button
            className={`source-btn ${audioSource === 'mic' ? 'active' : ''}`}
            onClick={() => setAudioSource('mic')}
            disabled={isListening || isCapturing}
            title="麦克风输入"
          >🎤</button>
          <button
            className={`source-btn ${audioSource === 'system' ? 'active' : ''}`}
            onClick={() => setAudioSource('system')}
            disabled={isListening || isCapturing}
            title="系统音频（腾讯会议等）"
          >🖥️</button>
        </div>

        <div className="control-status">
          {isConnected && (
            <span className="status-chip">
              <span className="dot online" />
              AI 已连接
            </span>
          )}
          <span className="status-chip">
            <span className={`dot ${(isListening || isCapturing) ? 'online' : 'idle'}`} />
            {isListening ? status : isCapturing ? sysAudioStatus : (isSupported || sysAudioSupported ? '待机' : '需 Chrome')}
          </span>
        </div>

        <div className={`mic-grid ${isActive ? 'active' : ''}`} aria-hidden="true">
          {meterCells.map((cell, index) => (
            <div
              key={index}
              className="mic-cell"
              style={{
                backgroundColor: cell.active
                  ? `hsl(${220 - cell.intensity * 80}, 92%, ${38 + cell.intensity * 24}%)`
                  : 'rgba(255, 255, 255, 0.08)',
                transform: cell.active ? `scaleY(${0.75 + cell.intensity * 1.25})` : 'scaleY(0.65)'
              }}
            />
          ))}
        </div>

        <div className="control-actions">
          <button
            onClick={isListening ? stopRecognition : isCapturing ? stopSysCapture : handleStart}
            className={`btn ${(isListening || isCapturing) ? 'btn-danger' : 'btn-primary'}`}
            disabled={audioSource === 'system' ? !sysAudioSupported : !isSupported}
          >
            {isListening ? '⏹ 停止' : isCapturing ? '⏹ 停止捕获' : audioSource === 'system' ? '🖥️ 开始系统音频翻译' : '🎤 开始翻译'}
          </button>

          {(isElectron || pip.isSupported) && (
            <button
              onClick={() => {
                if (isElectron) {
                  (window as any).electronAPI.openPip();
                  setElectronPipOpen(true);
                } else {
                  pip.open();
                }
              }}
              className="btn btn-ghost"
              disabled={isElectron ? electronPipOpen : pip.isOpen}
              title={isElectron ? '打开悬浮字幕窗（无边框置顶浮窗）' : '打开悬浮字幕窗（可跨标签页显示）'}
            >
              📺 {(isElectron ? electronPipOpen : pip.isOpen) ? '已开启' : '浮窗'}
            </button>
          )}

          <div ref={folderMenuRef} className="folder-menu">
            <button
              onClick={() => setFolderMenuOpen((open) => !open)}
              className="btn btn-ghost folder-toggle"
              disabled={isListening || isCapturing}
            >
              📁 {selectedFolder.name}
              <span className={`chevron ${folderMenuOpen ? 'open' : ''}`}>▼</span>
            </button>
            <div className={`folder-dropdown ${folderMenuOpen ? 'open' : ''}`}>
              <div className="folder-dropdown-header">会话文件夹</div>
              <ul className="folder-list">
                {folders.map((folder) => (
                  <li key={folder.id} className={folder.id === selectedFolderId ? 'active' : ''}>
                    <button
                      type="button"
                      className="folder-item"
                      onClick={() => selectFolder(folder.id)}
                      disabled={isListening || isCapturing}
                    >
                      <span>{folder.name}</span>
                      <span className="folder-meta">{folder.entries.filter((e) => e.mode === 'final').length} 条</span>
                    </button>
                    {folders.length > 1 && (
                      <button type="button" className="folder-delete" onClick={() => deleteFolder(folder.id)} aria-label="删除文件夹">
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="folder-create">
                <input
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="新文件夹名称"
                />
                <button type="button" className="btn btn-primary" onClick={createFolder} disabled={!newFolderName.trim()}>
                  新建
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <SubtitleOverlay
        entries={selectedFolder.entries}
        corrections={selectedFolder.corrections}
        isConnected={isConnected}
      />

      <TranslationHistory
        entries={selectedFolder.entries}
        corrections={selectedFolder.corrections}
        stats={stats}
        isOpen={historyOpen}
        onToggle={() => setHistoryOpen((v) => !v)}
        sourceLanguage={language}
      />

      {/* ── 我的收藏 ── */}
      <div className="favorites-panel">
        <button
          className="history-toggle"
          onClick={() => setHistoryOpen((v) => !v)}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
        <div className="fav-header">
          <span className="fav-title">
            ⭐ 我的收藏
            <span className="history-stats-inline">
              <span>{favorites.length} 组</span>
            </span>
          </span>
        </div>
        <div className="fav-body">
          {favorites.length === 0 ? (
            <p className="history-empty-state">悬浮窗保存的字幕将出现在这里</p>
          ) : (
            <ul className="fav-list">
              {favorites.map((fav) => (
                <li key={fav.id} className="fav-collection">
                  <div className="fav-collection-header">
                    <span className="fav-collection-name">{fav.name}</span>
                    <span className="fav-collection-meta">
                      {fav.entries.length} 条 · {new Date(fav.createdAt).toLocaleString('zh-CN')}
                    </span>
                    <button
                      className="btn btn-ghost fav-summarize-btn"
                      onClick={() => handleSummarize(fav.id)}
                      disabled={summarizingId === fav.id}
                    >
                      {summarizingId === fav.id ? '⏳ 生成中...' : fav.summary ? '🔄 重新生成' : '📋 AI摘要'}
                    </button>
                    <button
                      className="folder-delete"
                      onClick={() => deleteFavorite(fav.id)}
                      aria-label="删除收藏"
                    >
                      ×
                    </button>
                  </div>
                  {fav.summary && (
                    <div className="fav-summary">
                      <div className="fav-summary-header">📋 会议摘要</div>
                      <p className="fav-summary-text">{fav.summary}</p>
                    </div>
                  )}
                  <div className="fav-collection-entries">
                    {fav.entries.map((entry) => (
                      <div key={entry.id} className="fav-entry">
                        <span className="fav-entry-time">
                          {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <p className="fav-entry-text">{entry.translation}</p>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

    </main>
  );
}

export default App;
