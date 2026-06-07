import { useCallback, useEffect, useRef, useState } from 'react';
import type { SubtitleEntry } from '../components/SubtitleOverlay';

/**
 * Generates the complete HTML document for the Picture-in-Picture window.
 * Includes inline CSS/JS — self-contained, no React dependency.
 */
function buildPiPHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI 同声传译 · 实时字幕</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%;
    overflow: hidden;
    font-family: 'SF Pro Display', 'Inter', ui-sans-serif, system-ui, sans-serif;
    background: transparent;
    -webkit-font-smoothing: antialiased;
  }
  body {
    display: flex;
    flex-direction: column;
    background: rgba(30, 30, 35, 0.82);
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    border-radius: 10px;
    overflow: hidden;
    user-select: none;
    position: relative;
  }

  /* Drag region — entire header acts as drag handle */
  .pip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    -webkit-app-region: drag;
    app-region: drag;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }
  .pip-title {
    font-size: 12px;
    font-weight: 600;
    color: #f4f4f5;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pip-count {
    font-size: 10px;
    color: #a1a1aa;
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 6px;
    border-radius: 8px;
  }

  /* Buttons — exclude from drag region */
  .pip-actions {
    display: flex;
    gap: 4px;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }
  .pip-btn {
    width: 26px; height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: #a1a1aa;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 150ms;
  }
  .pip-btn:hover { background: rgba(255,255,255,0.1); color: #f4f4f5; }
  .pip-btn:disabled { opacity: 0.3; cursor: default; }
  .pip-btn.danger:hover { background: rgba(239,68,68,0.15); color: #ef4444; }

  /* Subtitle list */
  .pip-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pip-list::-webkit-scrollbar { width: 3px; }
  .pip-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
  .pip-empty {
    color: #71717a;
    font-size: 12px;
    text-align: center;
    padding: 20px 0;
  }
  .pip-item {
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 6px;
    border-left: 2px solid #3b82f6;
    animation: pip-in 280ms ease-out;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  @keyframes pip-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .pip-time {
    font-size: 9px;
    color: #71717a;
  }
  .pip-text {
    font-size: 13px;
    color: #f4f4f5;
    line-height: 1.4;
    word-break: break-word;
  }

  /* Bottom-right resize handle */
  .pip-resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 18px;
    height: 18px;
    cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.12) 50%);
    border-radius: 0 0 10px 0;
    z-index: 10;
  }
</style>
</head>
<body>
  <div class="pip-header" id="pipHeader">
    <span class="pip-title">
      <span>🎙️</span> 实时翻译字幕
      <span class="pip-count" id="pipCount">0</span>
    </span>
    <div class="pip-actions">
      <button class="pip-btn" id="btnClear" title="清空字幕" disabled>🗑️</button>
      <button class="pip-btn" id="btnSave" title="保存到我的收藏" disabled>💾</button>
      <button class="pip-btn danger" id="btnClose" title="关闭浮窗">✕</button>
    </div>
  </div>
  <div class="pip-list" id="pipList">
    <p class="pip-empty">等待翻译结果...</p>
  </div>
  <div class="pip-resize-handle" id="resizeHandle"></div>

<script>
  // ── State ──
  var entries = [];
  var width = 340;
  var height = 420;

  // Restore saved size
  try {
    var saved = JSON.parse(localStorage.getItem('pip-window-size'));
    if (saved && saved.w && saved.h) { width = saved.w; height = saved.h; }
  } catch(e) {}

  var listEl = document.getElementById('pipList');
  var countEl = document.getElementById('pipCount');
  var btnClear = document.getElementById('btnClear');
  var btnSave = document.getElementById('btnSave');
  var btnClose = document.getElementById('btnClose');
  var resizeHandle = document.getElementById('resizeHandle');

  // ── BroadcastChannel for main↔PiP communication ──
  var channel = new BroadcastChannel('pip-subtitles');

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }

  function render() {
    countEl.textContent = entries.length;
    btnClear.disabled = entries.length === 0;
    btnSave.disabled = entries.length === 0;

    if (entries.length === 0) {
      listEl.innerHTML = '<p class="pip-empty">等待翻译结果...</p>';
      return;
    }

    var html = '';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      html += '<div class="pip-item">'
        + '<span class="pip-time">' + formatTime(e.timestamp) + '</span>'
        + '<p class="pip-text">' + escapeHtml(e.translation) + '</p>'
        + '</div>';
    }
    listEl.innerHTML = html;
    listEl.scrollTop = listEl.scrollHeight;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Receive from main window ──
  channel.onmessage = function(event) {
    var msg = event.data;
    switch (msg.type) {
      case 'sync':
        entries = msg.entries || [];
        render();
        break;
      case 'add':
        entries.push(msg.entry);
        render();
        break;
      case 'correct':
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].id === msg.id) {
            entries[i].translation = msg.newTranslation;
            entries[i].confidence = msg.confidence || entries[i].confidence;
            break;
          }
        }
        render();
        break;
      case 'clear':
        entries = [];
        render();
        channel.postMessage({ type: 'cleared' });
        break;
    }
  };

  // ── Send actions to main window ──
  btnClear.addEventListener('click', function() {
    entries = [];
    render();
    channel.postMessage({ type: 'clear' });
  });

  btnSave.addEventListener('click', function() {
    channel.postMessage({ type: 'save', entries: entries });
  });

  btnClose.addEventListener('click', function() {
    channel.postMessage({ type: 'close' });
  });

  // ── Resize via bottom-right handle ──
  var isResizing = false;
  var startX, startY, startW, startH;

  resizeHandle.addEventListener('mousedown', function(e) {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startW = width;
    startH = height;
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;
    width = Math.max(260, Math.min(800, startW + (e.clientX - startX)));
    height = Math.max(160, Math.min(900, startH + (e.clientY - startY)));
    document.body.style.width = width + 'px';
    document.body.style.height = height + 'px';
  });

  document.addEventListener('mouseup', function() {
    if (isResizing) {
      isResizing = false;
      try {
        localStorage.setItem('pip-window-size', JSON.stringify({ w: width, h: height }));
      } catch(e) {}
    }
  });

  // Apply saved size
  document.body.style.width = width + 'px';
  document.body.style.height = height + 'px';
</script>
</body>
</html>`;
}

interface PiPWindowAPI {
  /** Whether Document PiP is supported in this browser. */
  isSupported: boolean;
  /** Whether the PiP window is currently open. */
  isOpen: boolean;
  /** Open the PiP window. Must be called from a user gesture. */
  open: () => Promise<void>;
  /** Close the PiP window programmatically. */
  close: () => void;
}

/**
 * Hook managing a Document Picture-in-Picture floating window
 * that persists across browser tabs.
 *
 * Uses BroadcastChannel for bidirectional communication between
 * the main window and the PiP window.
 */
export function usePiPWindow(
  entries: SubtitleEntry[],
  onSave: (entries: SubtitleEntry[]) => void,
  onClear: () => void,
  onClose: () => void,
  disabled = false
): PiPWindowAPI {
  const pipWindowRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const isSupported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window && !disabled;

  // ── Sync entries to PiP window whenever they change ──
  useEffect(() => {
    if (disabled || !channelRef.current || !isOpen) return;
    channelRef.current.postMessage({ type: 'sync', entries });
  }, [disabled, entries, isOpen]);

  // ── Listen for PiP actions ──
  useEffect(() => {
    if (disabled || !isSupported) return;

    const channel = new BroadcastChannel('pip-subtitles');
    channelRef.current = channel;

    channel.onmessage = (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'clear':
          onClear();
          break;
        case 'save':
          onSave(msg.entries || []);
          break;
        case 'close':
          if (pipWindowRef.current) {
            pipWindowRef.current.close();
            pipWindowRef.current = null;
          }
          setIsOpen(false);
          onClose();
          break;
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [disabled, isSupported, onSave, onClear, onClose]);

  // ── Clean up on unmount ──
  useEffect(() => {
    return () => {
      if (pipWindowRef.current) {
        pipWindowRef.current.close();
        pipWindowRef.current = null;
      }
    };
  }, []);

  const open = useCallback(async () => {
    if (!isSupported || isOpen) return;

    try {
      const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
        width: 380,
        height: 460,
      });

      pipWindowRef.current = pipWindow;

      // Write self-contained HTML into the PiP window
      pipWindow.document.write(buildPiPHtml());
      pipWindow.document.close();

      // Send initial entries after a short delay (wait for script to init)
      setTimeout(() => {
        channelRef.current?.postMessage({ type: 'sync', entries });
      }, 100);

      pipWindow.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
        setIsOpen(false);
        onClose();
      });

      setIsOpen(true);
    } catch (err) {
      console.error('Failed to open PiP window:', err);
    }
  }, [isSupported, isOpen, entries, onClose]);

  const close = useCallback(() => {
    if (pipWindowRef.current) {
      pipWindowRef.current.close();
      pipWindowRef.current = null;
    }
    setIsOpen(false);
  }, []);

  return { isSupported, isOpen, open, close };
}
