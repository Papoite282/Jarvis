I've been quietly building a desktop app that I now use every day, so I figured it was time to write it up.

It's called Jarvis — a personal AI assistant that lives in the macOS menu bar. Press ⌥Space anywhere on the machine and a chat interface opens. Type or speak a command. It executes it.

Not a chatbot UI. An actual agentic loop.

Under the hood it runs @anthropic-ai/claude-agent-sdk — the same engine behind Claude Code — so it has real tool use: reading and writing files, running terminal commands, searching the web, calling MCP servers. When it's done, it speaks the response out loud using the macOS `say` command (no TTS API, no latency, just the system).

A few things I'm proud of engineering-wise:

**Per-project session memory.** The working directory picker in the titlebar isn't just cosmetic — switching projects restores that project's conversation history. Each directory has its own session ID and transcript, persisted between app launches. Changing context doesn't destroy previous work.

**MCP server inheritance.** The app reads `~/Library/.../Claude/claude_desktop_config.json` on every command and injects whatever servers are configured in Claude Desktop — Desktop Commander, custom tools, whatever. Zero config.

**Security from the start.** Electron renderer runs sandboxed with `contextIsolation: true`, strict CSP (`script-src 'self'`), and typed IPC via context bridge. TTS uses `spawn` with array args so there's no shell injection surface even if the AI hallucinates unusual characters. Markdown rendering escapes HTML before applying any transformations.

**Packaged as a real `.app`.** electron-builder handles packaging for Apple Silicon. The tricky part was that the Claude CLI binary (214MB Mach-O ARM64) can't run from inside an asar archive — it has to be unpacked to the filesystem. Figuring out the correct `asarUnpack` config and path resolution between dev and production took a few iterations.

The project is open source. If you're building with Electron and Claude, hopefully the structure is useful as a reference — particularly the per-project session architecture and the binary path resolution across dev/packaged environments.

→ github.com/Papoite282/Jarvis

Built with: Electron · Claude Agent SDK · Swift (native speech recognition) · electron-builder · Vanilla JS

#buildinpublic #electron #anthropic #claude #macos #opensource #javascript
