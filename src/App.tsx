import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSystemAudioCapture } from './hooks/useSystemAudioCapture';
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

interface TranslationFolder {
  id: string;
  name: string;
  entries: SubtitleEntry[];
  corrections: CorrectionEvent[];
  createdAt: number;
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
  sendMessageRef.current = sendMessage;

  const activeAudioLevel = audioSource === 'system' ? sysAudioLevel : audioLevel;
  const isActive = audioSource === 'system' ? isCapturing : isListening;

  const meterCells = useMemo(() => {
    return Array.from({ length: 8 }, (_, index) => {
      // Log-scale threshold: lower bars light up easily, higher bars need louder input
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
      // System audio mode: capture → send PCM chunks → server STT → translate
      const langMap: Record<string, string> = {
        'en-US': 'en', 'ja-JP': 'ja', 'ko-KR': 'ko', 'zh-CN': 'zh',
      };
      sendMessageRef.current({ type: 'audio-start', language: langMap[language] || 'en' });
      startSysCapture((base64Pcm: string) => {
        sendMessageRef.current({ type: 'audio-chunk', data: base64Pcm });
      });
    } else {
      // Mic mode: browser STT → send text → server translate
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
  }, [isListening, isCapturing, stopRecognition, stopSysCapture, selectedFolderId]);

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
                      disabled={isListening}
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
      />
    </main>
  );
}

export default App;
