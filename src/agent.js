import os from 'node:os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getSessionId, setSessionId, appendTranscript, clearSession } from './state.js';

const AUTO_ALLOW_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'TodoWrite',
  'AskUserQuestion',
]);

let sessionId = getSessionId();
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
    if (AUTO_ALLOW_TOOLS.has(toolName)) {
      return { behavior: 'allow' };
    }
    return new Promise((resolve) => {
      pendingPermissions.set(opts.toolUseID, resolve);
      onPermissionRequest({
        toolUseID: opts.toolUseID,
        toolName,
        input,
        title: opts.title,
        description: opts.description,
      });
    });
  };
}

async function runCommand(promptText, { onEvent, onPermissionRequest }) {
  abortController = new AbortController();
  appendTranscript('user', promptText);

  const options = {
    cwd: os.homedir(),
    permissionMode: 'default',
    canUseTool: makeCanUseTool(onPermissionRequest),
    abortController,
    resume: sessionId,
  };

  let finalResult = null;
  for await (const message of query({ prompt: promptText, options })) {
    if (message.type === 'system' && message.subtype === 'init') {
      sessionId = message.session_id ?? sessionId;
      setSessionId(sessionId);
    }
    if (message.type === 'assistant') {
      for (const block of message.message?.content ?? []) {
        if (block.type === 'text' && block.text) appendTranscript('jarvis', block.text);
      }
    }
    if (message.type === 'result') {
      finalResult = message;
    }
    onEvent(message);
  }
  return finalResult;
}

function resetSession() {
  sessionId = undefined;
  clearSession();
}

export { runCommand, stop, resolvePermission, resetSession };
