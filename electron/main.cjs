/**
 * Electron main process — AI 同声传译助手
 *
 * Manages:
 * - Main application window (loads React app from Express)
 * - Floating subtitle PiP window (frameless, always-on-top, transparent)
 * - Embedded Express + WebSocket server (spawned as child process)
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');

let mainWindow = null;
let pipWindow = null;
let serverProcess = null;

const isDev = process.env.NODE_ENV !== 'production';

// ── Server ──────────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '..', 'server', 'index.js');
    serverProcess = spawn('node', [serverPath], {
      stdio: isDev ? 'inherit' : 'pipe',
      env: { ...process.env },
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });

    // Give the server a moment to start, then consider it ready
    setTimeout(resolve, 1500);

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Server exited with code ${code}`);
      }
    });
  });
}

// ── Main Window ─────────────────────────────────────────────────────

function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1280, width),
    height: Math.min(860, height),
    minWidth: 800,
    minHeight: 600,
    title: 'AI 同声传译助手',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev mode, load from the Express dev server.
  // In production, load the built dist files.
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── PiP Floating Window ─────────────────────────────────────────────

function createPipWindow() {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.show();
    pipWindow.focus();
    return;
  }

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  // Restore saved size or use defaults
  let pipW = 380;
  let pipH = 460;
  try {
    const saved = JSON.parse(readFileSync(
      path.join(app.getPath('userData'), 'pip-size.json'), 'utf-8'
    ));
    if (saved && saved.w && saved.h) { pipW = saved.w; pipH = saved.h; }
  } catch (e) { /* use defaults */ }

  pipWindow = new BrowserWindow({
    width: pipW,
    height: pipH,
    x: screenW - pipW - 40,
    y: screenH - pipH - 80,
    frame: false,           // No OS title bar — pure floating glass
    transparent: true,      // Enables glass-morphism background
    alwaysOnTop: true,      // Float above ALL other windows (incl. Tencent Meeting)
    resizable: true,
    skipTaskbar: true,      // Not a regular app window
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pipWindow.loadFile(path.join(__dirname, 'pip.html'));

  // Persist size on resize
  pipWindow.on('resize', () => {
    if (pipWindow && !pipWindow.isDestroyed()) {
      const [w, h] = pipWindow.getSize();
      try {
        writeFileSync(
          path.join(app.getPath('userData'), 'pip-size.json'),
          JSON.stringify({ w, h })
        );
      } catch (e) { /* ignore */ }
    }
  });

  // Notify main window when pip closes
  pipWindow.on('closed', () => {
    pipWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pip-closed');
    }
  });
}

// ── IPC Handlers ────────────────────────────────────────────────────

ipcMain.on('open-pip', () => {
  createPipWindow();
});

ipcMain.on('close-pip', () => {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.close();
    pipWindow = null;
  }
});

ipcMain.handle('is-pip-open', () => {
  return pipWindow !== null && !pipWindow.isDestroyed();
});

// ── App Lifecycle ───────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    if (isDev) {
      await startServer();
      console.log('Server started on http://localhost:3000');
    }
  } catch (err) {
    console.error('Server start failed:', err);
  }

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
