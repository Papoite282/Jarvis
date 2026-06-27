import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { runCommand, stop, resolvePermission } from './src/agent.js';
import { getTranscript } from './src/state.js';
import { startVoice, stopVoice } from './src/voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

let mainWindow;

function hasCredentials() {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN,
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 880,
    backgroundColor: '#060b13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    const transcript = getTranscript();
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
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
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

ipcMain.on('jarvis:stop', () => stop());

ipcMain.on('jarvis:permission-response', (_event, { toolUseID, allow }) => {
  resolvePermission(toolUseID, allow);
});

ipcMain.on('jarvis:voice-start', (event, lang) => {
  startVoice(lang, (message) => event.sender.send('jarvis:voice-event', message));
});

ipcMain.on('jarvis:voice-stop', () => stopVoice());
