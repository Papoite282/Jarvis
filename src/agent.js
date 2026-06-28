import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getSessionId, setSessionId, appendTranscript, clearAll, getCwd } from './state.js';

// Lê os MCP servers configurados no Claude Desktop e herda-os automaticamente
function loadMcpServers() {
  try {
    const configPath = path.join(
      os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json',
    );
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config.mcpServers ?? {};
  } catch {
    return {};
  }
}

const AUTO_ALLOW_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite', 'AskUserQuestion',
]);

const JARVIS_PERSONALITY = `
## Interface Jarvis — Regras de comportamento

Estás a correr como **Jarvis**, interface gráfica de desktop (Electron) construída pelo Mestre para uso pessoal.

### Comunicação
- Responde sempre em **português de Portugal** (não brasileiro)
- Trata o utilizador como **"Mestre"** — nunca por "Eduardo", "você" ou "tu" a seco
- Assina-te sempre como **Jarvis** quando te apresentares
- Tom direto e eficiente, sem rodeios — como um assistente executivo competente

### Estilo de resposta nesta UI
- Vai direto ao ponto; evita introduções desnecessárias como "Claro!", "Certamente!" ou "Com certeza!"
- Para tarefas técnicas: executa primeiro, explica o essencial depois
- Quando há múltiplos passos, informa o Mestre do progresso ao longo do caminho
- Usa formatação simples — prefere prosa quando markdown não acrescenta clareza
- Esta é uma interface pessoal, não um terminal de CI/CD: aborda como parceiro técnico próximo
`.trim();

// Nota: sem sessionId global — é lido do state por CWD em cada runCommand
let abortController;
const pendingPermissions = new Map();

function stop() {
  abortController?.abort();
}

function resolvePermission(toolUseID, allow, message) {
  const resolve = pendingPermissions.get(toolUseID);
  if (!resolve) return;
  pendingPermissions.delete(toolUseID);
  resolve(
    allow
      ? { behavior: 'allow' }
      : { behavior: 'deny', message: message || 'O usuário negou esta ação.' },
  );
}

function makeCanUseTool(onPermissionRequest) {
  return async (toolName, input, opts) => {
    if (AUTO_ALLOW_TOOLS.has(toolName)) return { behavior: 'allow' };
    return new Promise((resolve) => {
      pendingPermissions.set(opts.toolUseID, resolve);
      onPermissionRequest({
        toolUseID: opts.toolUseID, toolName, input,
        title: opts.title, description: opts.description,
      });
    });
  };
}

async function runCommand(promptText, { onEvent, onPermissionRequest }) {
  abortController = new AbortController();

  // CWD e sessionId capturados no início do comando — estáveis durante toda a execução
  const cwd = getCwd();
  let sessionId = getSessionId(cwd);

  appendTranscript('user', promptText, cwd);

  const options = {
    cwd,
    permissionMode: 'default',
    canUseTool: makeCanUseTool(onPermissionRequest),
    abortController,
    resume: sessionId,
    mcpServers: loadMcpServers(),
    systemPrompt: { type: 'preset', preset: 'claude_code', append: JARVIS_PERSONALITY },
  };

  let finalResult = null;
  for await (const message of query({ prompt: promptText, options })) {
    if (message.type === 'system' && message.subtype === 'init') {
      sessionId = message.session_id ?? sessionId;
      setSessionId(sessionId, cwd);
    }
    if (message.type === 'assistant') {
      for (const block of message.message?.content ?? []) {
        if (block.type === 'text' && block.text) {
          appendTranscript('jarvis', block.text, cwd);
        }
      }
    }
    if (message.type === 'result') finalResult = message;
    onEvent(message);
  }
  return finalResult;
}

// Limpa só o projecto activo (não toca nos outros)
function resetSession() {
  clearAll(getCwd());
}

export { runCommand, stop, resolvePermission, resetSession };
