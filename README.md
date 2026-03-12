<p align="center">
  <h1 align="center">🚀 OpenFlow</h1>
  <p align="center">
    <strong>AI Coding Session Orchestration Dashboard</strong>
  </p>
  <p align="center">
    Launch, monitor, and manage Claude Code sessions from a beautiful web UI.
  </p>
</p>

<p align="center">
  <a href="https://github.com/ai-genius-automations/openflow/stargazers"><img src="https://img.shields.io/github/stars/ai-genius-automations/openflow?style=flat&color=gold" alt="GitHub Stars"></a>
  <a href="https://github.com/ai-genius-automations/openflow/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0%20+%20Commons%20Clause-blue" alt="License"></a>
  <a href="https://github.com/ai-genius-automations/openflow/releases"><img src="https://img.shields.io/github/v/release/ai-genius-automations/openflow?color=green" alt="Release"></a>
  <a href="https://aigeniusautomations.com"><img src="https://img.shields.io/badge/by-AI%20Genius%20Automations-purple" alt="AI Genius Automations"></a>
</p>

---

> **OpenFlow** is a local-first orchestration dashboard for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Run multi-agent hive-mind sessions, single-agent workflows, and interactive terminals — all from one place with real-time streaming.

---

## ✨ Features

- 🐝 **Hive-Mind Sessions** — Launch multi-agent Claude Code orchestration via [ruflo](https://www.npmjs.com/package/claude-flow)
- 🤖 **Agent Sessions** — Run single-agent sessions with custom agent definitions (`.claude/agents/*.md`)
- 💻 **Terminal Sessions** — Interactive terminals managed through the dashboard
- 📡 **Real-Time Streaming** — WebSocket-powered live output, tool calls, and progress tracking
- 📁 **Project Management** — Multi-project support with per-project settings and agent configurations
- 📋 **Task Queue** — Organize and queue work items for your coding sessions
- 🎙️ **Speech-to-Text** — Voice commands via local Whisper or cloud APIs (desktop app)
- 🖥️ **Desktop App** — Electron system tray app with native STT and auto-launch
- 🔒 **Encrypted Config** — API keys encrypted at rest with AES-256-GCM

---

## 📦 Quick Install

### One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/ai-genius-automations/openflow/main/scripts/install.sh | bash
```

This will:
1. Check prerequisites (Node.js 20+, tmux, git)
2. Clone the repo to `~/openflow`
3. Install dependencies and build
4. Add the `openflow` CLI to your PATH

Then start it:

```bash
openflow start        # Start the server
openflow status       # Check status
```

> 💡 **Custom install location:** `OPENFLOW_INSTALL_DIR=/opt/openflow bash install.sh`

### Manual Install (Development)

```bash
git clone https://github.com/ai-genius-automations/openflow.git
cd openflow
npm run install:all
npm run dev
```

- **Dashboard:** http://localhost:5173
- **API Server:** http://localhost:42012

---

## 🛠️ Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org) |
| **tmux** | any | `sudo apt install tmux` / `brew install tmux` |
| **Claude Code** | latest | [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code) |
| **dtach** *(optional)* | any | `sudo apt install dtach` — persists sessions across restarts |

---

## 🖥️ CLI Commands

Once installed, the `openflow` command manages the server:

```bash
openflow start              # Start the server (background)
openflow stop               # Stop the server
openflow restart            # Restart
openflow status             # Show version, channel, and update info
openflow update             # Check for and apply updates
openflow channel [name]     # Switch release channel (stable/beta/canary)
openflow logs               # Tail server logs
openflow install-service    # Install as systemd/launchd service (auto-start)
openflow uninstall-service  # Remove the system service
```

---

## 🏗️ Architecture

```
┌──────────────────────┐     WebSocket      ┌─────────────────────────┐
│   Dashboard (React)  │ ◄────────────────► │    Server (Fastify)     │
│   Vite + Tailwind    │                    │    SQLite + WebSocket   │
│   TanStack Query     │                    │                         │
│   Zustand            │                    │    PTY Worker           │
└──────────────────────┘                    │    ├── tmux sessions    │
                                            │    ├── Claude Code      │
                                            │    └── Terminal shells  │
                                            └─────────────────────────┘
```

| Layer | Stack |
|-------|-------|
| **Frontend** | React 19, Vite, Tailwind CSS 4, TanStack Query, Zustand, xterm.js |
| **Backend** | Fastify, TypeScript, SQLite (better-sqlite3), node-pty, WebSocket |
| **Desktop** | Electron, system tray, local Whisper STT, AES-256-GCM config encryption |
| **Sessions** | tmux for persistence, dtach for detach/reattach, Claude Code CLI |

---

## 📂 Project Structure

```
openflow/
├── server/              # Fastify backend
│   └── src/
│       ├── routes/      # REST API endpoints
│       ├── services/    # Session manager, PTY worker, state tracking
│       └── db/          # SQLite schema and migrations
├── dashboard/           # React frontend
│   └── src/
│       ├── components/  # UI components
│       └── lib/         # API client, stores, utilities
├── desktop-electron/    # Electron desktop app
│   └── src/
│       └── speech/      # Whisper STT integration
├── desktop/             # Tauri desktop app (alternative)
├── bin/                 # CLI launcher
├── scripts/             # Install, update, and service scripts
└── .env.example         # Environment variable reference
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `42012` | Server port |
| `OPENFLOW_TOKEN` | *(none)* | Auth token for API/WebSocket — leave empty for local use |
| `DB_PATH` | `~/.openflow/openflow.db` | SQLite database path |
| `LOG_LEVEL` | `info` | Log verbosity (`trace` / `debug` / `info` / `warn` / `error`) |
| `OPENFLOW_USE_TMUX` | `true` | Use tmux for session management |
| `OPENFLOW_USE_DTACH` | `true` | Use dtach for session persistence |

---

## 🖥️ Desktop App

The Electron desktop app adds:
- System tray with quick server access
- Automatic server lifecycle management
- Local speech-to-text via Whisper (no cloud needed)
- Cloud STT via OpenAI Whisper API or Groq (API keys encrypted at rest)

```bash
cd desktop-electron
npm install
npm run build
npm start
```

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or pull request.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a PR

---

## 📄 License

**Apache License 2.0 with Commons Clause** — see [LICENSE](LICENSE) for full details.

You are free to use, modify, and distribute OpenFlow. You may use it as a tool in your workflow to build products you charge for. However, you may not sell products or services whose value derives substantially from OpenFlow itself. Any product that incorporates OpenFlow source code must be distributed free of charge.

Copyright 2025 [AI Genius Automations](https://aigeniusautomations.com)
