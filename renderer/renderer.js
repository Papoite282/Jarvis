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
  const resetBtn = document.getElementById('reset-btn');
  const cwdBtn = document.getElementById('cwd-btn');
  const cwdName = document.getElementById('cwd-name');
  const cwdDropdown = document.getElementById('cwd-dropdown');
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const searchCount = document.getElementById('search-count');
  const searchClose = document.getElementById('search-close');

  const logEntries = [];
  let pendingPermission = null;

  function timeNow() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function markdownToHtml(text) {
    function esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 1. Extrair code blocks antes de escapar
    const blocks = [];
    let out = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      blocks.push(`<pre><code>${esc(code.trim())}</code></pre>`);
      return `\x02B${blocks.length - 1}\x02`;
    });

    // 2. Escapar o resto
    out = esc(out);

    // 3. Inline code
    out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 4. Headers → bold com separação visual
    out = out.replace(/^#{1,6} (.+)$/gm, '<strong class="md-heading">$1</strong>');

    // 5. Bold / italic
    out = out.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__(.+?)__/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    out = out.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    // 6. Listas não ordenadas (blocos contíguos)
    out = out.replace(/((?:^[-*+] .+\n?)+)/gm, (blk) => {
      const items = blk.trim().split('\n').map(l => `<li>${l.replace(/^[-*+] /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    });

    // 7. Listas ordenadas
    out = out.replace(/((?:^\d+\. .+\n?)+)/gm, (blk) => {
      const items = blk.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `<ol>${items}</ol>`;
    });

    // 8. Parágrafos e quebras de linha
    out = out.replace(/\n\n+/g, '</p><p>');
    out = out.replace(/\n/g, '<br>');
    out = `<p>${out}</p>`;

    // 9. Limpar <p> vazios e à volta de elementos bloco
    out = out.replace(/<p>(<(?:ul|ol|pre)[^>]*>)/g, '$1');
    out = out.replace(/(<\/(?:ul|ol|pre)>)<\/p>/g, '$1');
    out = out.replace(/<p>\s*<\/p>/g, '');

    // 10. Restaurar code blocks
    out = out.replace(/\x02B(\d+)\x02/g, (_, i) => blocks[+i]);

    return out;
  }

  function appendBubble(role, text) {
    const isJarvis = role === 'jarvis';
    const bubble = document.createElement(isJarvis ? 'div' : 'p');
    bubble.className = `bubble ${role}`;
    if (isJarvis) {
      bubble.innerHTML = markdownToHtml(text);
    } else {
      bubble.textContent = text;
    }
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
    window.jarvis.speak(text);
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
      case 'project-changed':
        window.jarvis.speakStop();
        transcript.innerHTML = '';
        setTask(null);
        logEntries.length = 0;
        logBody.innerHTML = '';
        for (const entry of message.transcript) {
          appendBubble(entry.role, entry.text);
        }
        appendBubble('system', `→ ${message.name}`);
        break;
      case 'reset':
        transcript.innerHTML = '';
        setTask(null);
        logEntries.length = 0;
        logBody.innerHTML = '';
        appendBubble('system', 'Sessão limpa. Nova conversa iniciada.');
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
  stopBtn.addEventListener('click', () => { window.jarvis.stop(); window.jarvis.speakStop(); });
  permissionAllow.addEventListener('click', () => resolvePendingPermission(true));
  permissionDeny.addEventListener('click', () => resolvePendingPermission(false));

  resetBtn.addEventListener('click', () => {
    if (!confirm('Limpar conversa e iniciar nova sessão?')) return;
    window.jarvis.reset();
  });

  window.jarvis.onEvent(handleEvent);
  window.jarvis.onPermissionRequest(showPermissionRequest);
  window.jarvis.onStatus((status) => {
    const busy = status === 'busy';
    setHudState(busy ? 'busy' : 'idle');
    stopBtn.classList.toggle('hidden', !busy);
    resetBtn.disabled = busy;
    statusText.textContent = busy ? 'executando' : 'online';
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

  // --- Pesquisa (Cmd+F) ---
  function openSearch() {
    searchBar.classList.remove('hidden');
    searchInput.focus();
    searchInput.select();
  }

  function closeSearch() {
    searchBar.classList.add('hidden');
    searchInput.value = '';
    applySearch('');
  }

  function applySearch(term) {
    const bubbles = transcript.querySelectorAll('.bubble');
    if (!term) {
      bubbles.forEach(b => { b.classList.remove('search-hidden', 'search-match'); });
      searchCount.textContent = '';
      return;
    }
    const lower = term.toLowerCase();
    let matches = 0;
    bubbles.forEach(b => {
      const text = b.textContent.toLowerCase();
      if (text.includes(lower)) {
        b.classList.remove('search-hidden');
        b.classList.add('search-match');
        matches++;
      } else {
        b.classList.add('search-hidden');
        b.classList.remove('search-match');
      }
    });
    searchCount.textContent = matches ? `${matches} resultado${matches !== 1 ? 's' : ''}` : 'sem resultados';
  }

  searchInput.addEventListener('input', () => applySearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });
  searchClose.addEventListener('click', closeSearch);

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      if (searchBar.classList.contains('hidden')) openSearch();
      else closeSearch();
    }
  });

  // --- CWD Picker ---
  let cwdProjects = [];
  let cwdCurrent = '';

  function cwdBasename(p) {
    return p.replace(/\/$/, '').split('/').pop() || p;
  }

  function renderCwdDropdown() {
    cwdDropdown.innerHTML = '';
    for (const proj of cwdProjects) {
      const btn = document.createElement('button');
      btn.className = 'cwd-option' + (proj.path === cwdCurrent ? ' active' : '');
      btn.textContent = proj.name;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        cwdCurrent = proj.path;
        cwdName.textContent = proj.name;         // feedback visual imediato
        cwdDropdown.classList.add('hidden');
        await window.jarvis.setCwd(proj.path);   // main envia project-changed → handleEvent restaura histórico
      });
      cwdDropdown.appendChild(btn);
    }
    const sep = document.createElement('hr');
    sep.className = 'cwd-sep';
    cwdDropdown.appendChild(sep);
    const other = document.createElement('button');
    other.className = 'cwd-option';
    other.innerHTML = '<i class="ti ti-dots" aria-hidden="true"></i>&nbsp;outra pasta…';
    other.addEventListener('click', async (e) => {
      e.stopPropagation();
      cwdDropdown.classList.add('hidden');
      const selected = await window.jarvis.openDirPicker();
      if (!selected) return;
      cwdCurrent = selected;
      cwdName.textContent = cwdBasename(selected);
      cwdProjects = await window.jarvis.listProjects();
    });
    cwdDropdown.appendChild(other);
  }

  cwdBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renderCwdDropdown();
    cwdDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => cwdDropdown.classList.add('hidden'));

  (async () => {
    [cwdProjects, cwdCurrent] = await Promise.all([
      window.jarvis.listProjects(),
      window.jarvis.getCwd(),
    ]);
    cwdName.textContent = cwdBasename(cwdCurrent);
  })();
})();
