import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const STATE_FILE = path.join(app.getPath('userData'), 'jarvis-state.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { sessionId: undefined, transcript: [] };
  }
}

const state = readState();

function writeState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getSessionId() {
  return state.sessionId;
}

function setSessionId(sessionId) {
  state.sessionId = sessionId;
  writeState();
}

function getTranscript() {
  return state.transcript;
}

function appendTranscript(role, text) {
  state.transcript.push({ role, text, ts: Date.now() });
  writeState();
}

function clearSession() {
  state.sessionId = undefined;
  writeState();
}

export { getSessionId, setSessionId, getTranscript, appendTranscript, clearSession };
