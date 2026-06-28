import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const STATE_FILE = path.join(app.getPath('userData'), 'jarvis-state.json');
const DEFAULT_CWD = path.join(app.getPath('home'), 'Claude');
const DEFAULT_BOUNDS = { width: 760, height: 880 };

function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

    // Migração: formato antigo (sessão única) → novo (por projeto)
    const projects = raw.projects ? { ...raw.projects } : {};
    if (!raw.projects && (raw.sessionId !== undefined || raw.transcript?.length)) {
      const migratedCwd = raw.cwd ?? DEFAULT_CWD;
      projects[migratedCwd] = {
        sessionId: raw.sessionId ?? undefined,
        transcript: raw.transcript ?? [],
      };
    }

    return {
      projects,
      cwd: raw.cwd ?? DEFAULT_CWD,
      bounds: raw.bounds ?? DEFAULT_BOUNDS,
    };
  } catch {
    return { projects: {}, cwd: DEFAULT_CWD, bounds: DEFAULT_BOUNDS };
  }
}

const state = readState();

function writeState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Por projecto ---

function getProject(cwd) {
  if (!state.projects[cwd]) {
    state.projects[cwd] = { sessionId: undefined, transcript: [] };
  }
  return state.projects[cwd];
}

function getSessionId(cwd) {
  return getProject(cwd).sessionId;
}

function setSessionId(sessionId, cwd) {
  getProject(cwd).sessionId = sessionId;
  writeState();
}

function getTranscript(cwd) {
  return getProject(cwd).transcript ?? [];
}

function appendTranscript(role, text, cwd) {
  getProject(cwd).transcript.push({ role, text, ts: Date.now() });
  writeState();
}

function clearProject(cwd) {
  state.projects[cwd] = { sessionId: undefined, transcript: [] };
  writeState();
}

// clearAll limpa o projecto indicado (ou o activo por omissão)
function clearAll(cwd) {
  clearProject(cwd ?? state.cwd);
}

// clearSession apaga só o sessionId do projecto
function clearSession(cwd) {
  getProject(cwd ?? state.cwd).sessionId = undefined;
  writeState();
}

// --- Global ---

function getCwd() {
  return state.cwd;
}

function setCwd(newCwd) {
  state.cwd = newCwd;
  writeState();
}

function getBounds() {
  return state.bounds ?? DEFAULT_BOUNDS;
}

function setBounds(bounds) {
  state.bounds = bounds;
  writeState();
}

export {
  getSessionId, setSessionId,
  getTranscript, appendTranscript,
  clearSession, clearAll,
  getCwd, setCwd,
  getBounds, setBounds,
};
