import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_PATH = path.join(__dirname, '..', 'native', 'speech-cli');

let voiceProcess = null;

function startVoice(lang, onEvent) {
  if (voiceProcess) return;
  voiceProcess = spawn(BIN_PATH, [lang || 'pt-BR']);

  const rl = readline.createInterface({ input: voiceProcess.stdout });
  rl.on('line', (line) => {
    if (line === 'READY') {
      onEvent({ type: 'ready' });
    } else if (line.startsWith('PARTIAL:')) {
      onEvent({ type: 'partial', text: line.slice('PARTIAL:'.length) });
    } else if (line.startsWith('FINAL:')) {
      onEvent({ type: 'final', text: line.slice('FINAL:'.length) });
    }
  });

  let stderrBuf = '';
  voiceProcess.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
  });

  voiceProcess.on('exit', (code) => {
    voiceProcess = null;
    if (code !== 0) {
      onEvent({ type: 'error', message: stderrBuf.trim() || `exit code ${code}` });
    }
    onEvent({ type: 'ended' });
  });

  voiceProcess.on('error', (err) => {
    voiceProcess = null;
    onEvent({ type: 'error', message: String(err?.message ?? err) });
  });
}

function stopVoice() {
  voiceProcess?.stdin.write('STOP\n');
}

export { startVoice, stopVoice };
