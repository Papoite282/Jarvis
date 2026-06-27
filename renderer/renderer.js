(function () {
  const hud = document.getElementById('hud');
  const hudLabel = document.getElementById('hud-label');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const transcript = document.getElementById('transcript');
  const taskBody = document.getElementById('task-body');
  const logBody = document.getElementById('log-body');
  const permission = document.getElementById('permission');
  const permissionTitle = document.getElementById('permission-title');
  const permissionDesc = document.getElementById('permission-desc');
  const permissionAllow = document.getElementById('permission-allow');
  const permissionDeny = document.getElementById('permission-deny');
  const textInput = document.getElementById('text-input');
  const sendBtn = document.getElementById('send-btn');
  const micBtn = document.getElementById('mic-btn');
  const stopBtn = document.getElementById('stop-btn');

  const logEntries = [];
  let pendingPermission = null;

  function timeNow() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function appendBubble(role, text) {
    const bubble = document.createElement('p');
    bubble.className = `bubble ${role}`;
    bubble.textContent = text;
    transcript.appendChild(bubble);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function pushLog(text) {
    logEntries.push(`${timeNow()} ${text}`);
    while (logEntries.length > 6) logEntries.shift();
    logBody.innerHTML = '';
    for (const entry of logEntries) {
      const p = document.createElement('p');
      p.className = 'log-entry';
      p.textContent = entry;
      logBody.appendChild(p);
    }
  }

  function setTask(name, detail) {
    taskBody.innerHTML = '';
    if (!name) {
      const idle = document.createElement('p');
      idle.className = 'task-idle';
      idle.textContent = 'nenhuma tarefa em execução';
      taskBody.appendChild(idle);
      return;
    }
    const title = document.createElement('p');
    title.className = 'task-name';
    title.innerHTML = '<i class="ti ti-terminal-2" aria-hidden="true"></i>';
    title.append(document.createTextNode(name));
    taskBody.appendChild(title);
    if (detail) {
      const p = document.createElement('p');
      p.className = 'task-detail';
      p.textContent = detail;
      taskBody.appendChild(p);
    }
  }

  function setHudState(state) {
    hud.classList.remove('idle', 'listening', 'busy');
    hud.classList.add(state);
    statusDot.classList.remove('busy', 'error');
    if (state === 'busy') {
      hudLabel.textContent = 'executando...';
      statusDot.classList.add('busy');
    } else if (state === 'listening') {
      hudLabel.textContent = 'ouvindo...';
    } else {
      hudLabel.textContent = 'pronto';
    }
  }

  function summarizeInput(input) {
    if (!input) return '';
    const key = ['file_path', 'path', 'command', 'pattern', 'query', 'url'].find((k) => input[k]);
    if (key) return String(input[key]).slice(0, 80);
    const json = JSON.stringify(input);
    return json.length > 80 ? `${json.slice(0, 80)}…` : json;
  }

  function speak(text) {
    if (!text || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }

  function handleAssistantMessage(message) {
    const blocks = message.message?.content ?? [];
    for (const block of blocks) {
      if (block.type === 'text' && block.text) {
        appendBubble('jarvis', block.text);
        speak(block.text);
      } else if (block.type === 'tool_use') {
        setTask(block.name, summarizeInput(block.input));
        pushLog(`${block.name} ${summarizeInput(block.input)}`.trim());
      }
    }
  }

  function handleEvent(message) {
    switch (message.type) {
      case 'restore':
        for (const entry of message.transcript) {
          appendBubble(entry.role, entry.text);
        }
        break;
      case 'setup-required':
        appendBubble('system', message.message);
        break;
      case 'error':
        appendBubble('error', message.message);
        setTask(null);
        break;
      case 'assistant':
        handleAssistantMessage(message);
        break;
      case 'result':
        setTask(null);
        if (message.is_error && message.result) {
          appendBubble('error', message.result);
        }
        break;
      default:
        break;
    }
  }

  function showPermissionRequest(request) {
    pendingPermission = request;
    permissionTitle.textContent = request.title || `Permitir ${request.toolName}?`;
    permissionDesc.textContent = request.description || summarizeInput(request.input);
    permission.classList.remove('hidden');
  }

  function resolvePendingPermission(allow) {
    if (!pendingPermission) return;
    window.jarvis.resolvePermission(pendingPermission.toolUseID, allow);
    pendingPermission = null;
    permission.classList.add('hidden');
  }

  function sendCommand(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    appendBubble('user', trimmed);
    pushLog(`você: ${trimmed}`.slice(0, 60));
    window.jarvis.sendCommand(trimmed);
    textInput.value = '';
  }

  sendBtn.addEventListener('click', () => sendCommand(textInput.value));
  textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendCommand(textInput.value);
  });
  stopBtn.addEventListener('click', () => window.jarvis.stop());
  permissionAllow.addEventListener('click', () => resolvePendingPermission(true));
  permissionDeny.addEventListener('click', () => resolvePendingPermission(false));

  window.jarvis.onEvent(handleEvent);
  window.jarvis.onPermissionRequest(showPermissionRequest);
  window.jarvis.onStatus((status) => {
    setHudState(status === 'busy' ? 'busy' : 'idle');
    stopBtn.classList.toggle('hidden', status !== 'busy');
    statusText.textContent = status === 'busy' ? 'executando' : 'online';
  });

  let listening = false;

  function stopListening() {
    listening = false;
    micBtn.classList.remove('active');
    setHudState('idle');
  }

  function handleVoiceEvent(message) {
    switch (message.type) {
      case 'ready':
        setHudState('listening');
        break;
      case 'partial':
        textInput.value = message.text;
        break;
      case 'final':
        stopListening();
        sendCommand(message.text);
        break;
      case 'error':
        stopListening();
        appendBubble('system', `Reconhecimento de voz falhou: ${message.message}`);
        break;
      case 'ended':
        if (listening) stopListening();
        break;
      default:
        break;
    }
  }

  window.jarvis.onVoiceEvent(handleVoiceEvent);

  micBtn.addEventListener('click', () => {
    if (listening) {
      window.jarvis.stopVoice();
      return;
    }
    listening = true;
    micBtn.classList.add('active');
    textInput.value = '';
    setHudState('listening');
    window.jarvis.startVoice('pt-BR');
  });

  setHudState('idle');
})();
