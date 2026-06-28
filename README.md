<img width="750" height="316" alt="Captura de ecrã 2026-06-28, às 19 16 04" src="https://github.com/user-attachments/assets/34677572-f04b-483e-8a90-d2df9eaaeafe" />




# J.A.R.V.I.S.

> A personal AI assistant desktop app for macOS, powered by the Claude Agent SDK.

Built as a native Electron application that puts a conversational AI with real tool-use capabilities — file reading, web search, code execution — one keypress away. No terminal required.

---

## What it does

Jarvis lives in your menu bar. Press **⌥Space** anywhere on your machine and a JARVIS-inspired HUD appears. Type or speak a command. The assistant executes it using the same engine that powers Claude Code, with full access to your filesystem, terminal, and the web.

It's not a chatbot wrapper — it's a local agentic loop that can read and write files, run shell commands, search the web, and maintain multi-turn memory across sessions.

---

## Features

- **Claude Agent SDK** — full tool-use loop (Read, Glob, Grep, Bash, WebSearch, WebFetch, and more)
- **Voice input** — native Swift speech recognition, runs entirely on-device
- **Voice output** — macOS `say` command with system voices (no API calls for TTS)
- **MCP server inheritance** — automatically loads servers configured in Claude Desktop
- **Per-project sessions** — switching the working directory restores that project's conversation history
- **Markdown rendering** — responses render with code blocks, lists, bold, headers — safely, with HTML escaped before any transformation
- **Menu bar tray** — app lives in the background, instant ⌥Space toggle
- **Persistent window bounds** — remembers size and position between launches
- **Cmd+F search** — filter through conversation history in real time
- **Session reset** — clear one project's history without touching others

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Electron 42 (Apple Silicon) |
| AI engine | `@anthropic-ai/claude-agent-sdk` |
| Voice input | Swift + `AVSpeechRecognizer` (native binary) |
| Voice output | macOS `say` via `spawn` |
| Renderer | Vanilla JS — no framework, no bundler |
| Packaging | `electron-builder` (dir + dmg targets) |
| State | JSON in `app.getPath('userData')` |

---

## Project structure

```
Jarvis/
├── main.js              # Electron main process — IPC, tray, TTS, CWD handlers
├── preload.cjs          # Context bridge (contextIsolation: true)
├── src/
│   ├── agent.js         # Claude Agent SDK integration, per-project sessions
│   ├── state.js         # Persistent state (sessions, transcript, CWD, bounds)
│   └── voice.js         # Swift binary wrapper for speech recognition
├── renderer/
│   ├── index.html       # UI with strict CSP (script-src 'self')
│   ├── renderer.js      # All UI logic — markdown parser, CWD picker, search
│   └── styles.css       # JARVIS-themed dark UI
├── native/
│   └── speech.swift     # Swift speech recognition — compiled to native/speech-cli
├── assets/
│   └── trayTemplate.png # Menu bar icon (template image, auto dark/light)
└── scripts/
    └── build-native.js  # Compiles speech.swift → native binary
```

---

## Setup

### Prerequisites

- macOS (Apple Silicon recommended)
- Node.js 18+
- A Claude subscription (Pro or Max) **or** an Anthropic API key

### Install

```bash
git clone https://github.com/Papoite282/Jarvis.git
cd Jarvis
npm install          # also compiles the Swift speech binary via postinstall
```

### Credentials

Jarvis needs a Claude token. The easiest way is the OAuth flow:

```bash
npx claude setup-token
```

This opens a browser, authenticates with your Claude account, and prints a token. Then:

```bash
# Create .env in the project root (for dev)
echo "CLAUDE_CODE_OAUTH_TOKEN=your-token-here" > .env
```

Alternatively, you can use a regular API key:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

### Run (development)

```bash
npm start
```

### Build as a macOS app

```bash
npm run build          # produces dist/mac-arm64/Jarvis.app
npm run build:dmg      # produces a distributable .dmg
```

Copy `dist/mac-arm64/Jarvis.app` to `/Applications` for a double-click experience.

**Note:** For the packaged app, place the `.env` at:
```
~/Library/Application Support/Jarvis/.env
```

---

## Security

The renderer runs in a sandboxed process with `contextIsolation: true`, `nodeIntegration: false`, and a strict CSP (`script-src 'self'`). All communication goes through a typed context bridge in `preload.cjs`. TTS uses `spawn` with array args — no shell injection possible.

Credentials are never committed (`.env` is gitignored). State is stored outside the project directory in `app.getPath('userData')`.

---

## Acknowledgements

Built on top of `@anthropic-ai/claude-agent-sdk` — the same engine that powers Claude Code — which handles the agentic tool-use loop, session management, and MCP server connectivity.

---

## License

ISC
