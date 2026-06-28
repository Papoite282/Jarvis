import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, globalShortcut, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { runCommand, stop, resolvePermission, resetSession } from './src/agent.js';
import { getTranscript, getCwd, setCwd, getBounds, setBounds } from './src/state.js';
import { startVoice, stopVoice } from './src/voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.join(os.homedir(), 'Claude');
dotenv.config({ path: path.join(__dirname, '.env') });

let mainWindow;
let tray = null;
let isQuitting = false;
let speakProcess = null;

// Remove markdown e trunca para o say não engasgar em textos enormes
function plainText(text) {
  return text
    .replace(/```[\s\S]*?```/g, 'bloco de código.')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6} /g, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800); // evitar falas demasiado longas
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('J.A.R.V.I.S.');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mostrar Jarvis', click: showWindow },
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', toggleWindow);
}

function hasCredentials() {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN,
  );
}

function createWindow() {
  const savedBounds = getBounds();

  mainWindow = new BrowserWindow({
    ...savedBounds,           // width, height, x, y (x/y só existem depois do 1.º move)
    minWidth: 520,
    minHeight: 560,
    backgroundColor: '#060b13',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    const transcript = getTranscript(getCwd());
    if (transcript.length) {
      mainWindow.webContents.send('jarvis:event', { type: 'restore', transcript });
    }
    if (!hasCredentials()) {
      mainWindow.webContents.send('jarvis:event', {
        type: 'setup-required',
        message:
          'Nenhuma credencial encontrada. Rode "npx claude setup-token" no terminal do projeto, copie o token e cole em .env como CLAUDE_CODE_OAUTH_TOKEN, depois reinicie o app.',
      });
    }
  });

  // Guardar posição/tamanho com debounce (evita writes excessivos ao arrastar)
  let boundsTimer = null;
  function saveBounds() {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) setBounds(mainWindow.getBounds());
    }, 500);
  }
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Fechar esconde a janela em vez de sair (a app vive no tray)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  globalShortcut.register('Alt+Space', toggleWindow);
});

// Com tray, a app mantém-se a correr mesmo sem janelas abertas
app.on('window-all-closed', () => {
  if (!tray && process.platform !== 'darwin') app.quit();
});

// Clicar no ícone do dock mostra a janela
app.on('activate', () => {
  if (mainWindow) showWindow();
  else createWindow();
});

// Cmd+Q ou pedido de saída explícito → permite fechar de facto
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.on('jarvis:command', (event, text) => {
  const sender = event.sender;
  sender.send('jarvis:status', 'busy');
  runCommand(text, {
    onEvent: (message) => sender.send('jarvis:event', message),
    onPermissionRequest: (request) => sender.send('jarvis:permission-request', request),
  })
    .catch((err) => {
      sender.send('jarvis:event', { type: 'error', message: String(err?.message ?? err) });
    })
    .finally(() => {
      sender.send('jarvis:status', 'idle');
    });
});

ipcMain.on('jarvis:stop', () => { stop(); killSpeak(); });

ipcMain.on('jarvis:reset', (event) => {
  killSpeak();
  resetSession();
  event.sender.send('jarvis:event', { type: 'reset' });
});

ipcMain.on('jarvis:permission-response', (_event, { toolUseID, allow }) => {
  resolvePermission(toolUseID, allow);
});

ipcMain.on('jarvis:voice-start', (event, lang) => {
  startVoice(lang, (message) => event.sender.send('jarvis:voice-event', message));
});

ipcMain.on('jarvis:voice-stop', () => stopVoice());

// --- TTS com say nativo do macOS ---

function killSpeak() {
  if (speakProcess) { speakProcess.kill(); speakProcess = null; }
}

ipcMain.on('jarvis:speak', (_event, text) => {
  killSpeak();
  const clean = plainText(text);
  if (!clean) return;
  // Tenta voz portuguesa; se falhar usa a voz padrão do sistema
  speakProcess = spawn('say', ['-v', 'Joana', clean]);
  speakProcess.on('error', () => {
    speakProcess = spawn('say', [clean]);
    speakProcess.on('exit', () => { speakProcess = null; });
  });
  speakProcess.on('exit', () => { speakProcess = null; });
});

ipcMain.on('jarvis:speak-stop', killSpeak);

// --- CWD handlers (invoke/handle — precisam de retornar valores) ---

ipcMain.handle('jarvis:get-cwd', () => getCwd());

ipcMain.handle('jarvis:set-cwd', (event, newCwd) => {
  setCwd(newCwd);
  event.sender.send('jarvis:event', {
    type: 'project-changed',
    cwd: newCwd,
    name: path.basename(newCwd) || newCwd,
    transcript: getTranscript(newCwd),
  });
  return newCwd;
});

ipcMain.handle('jarvis:list-projects', () => {
  const projects = [{ name: 'workspace', path: WORKSPACE }];
  try {
    const entries = fs.readdirSync(WORKSPACE, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      projects.push({ name: entry.name, path: path.join(WORKSPACE, entry.name) });
    }
  } catch { /* workspace não existe */ }
  return projects;
});

ipcMain.handle('jarvis:open-dir-picker', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    defaultPath: getCwd(),
    title: 'Selecionar pasta de trabalho',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const selected = result.filePaths[0];
  setCwd(selected);
  event.sender.send('jarvis:event', {
    type: 'project-changed',
    cwd: selected,
    name: path.basename(selected) || selected,
    transcript: getTranscript(selected),
  });
  return selected;
});
