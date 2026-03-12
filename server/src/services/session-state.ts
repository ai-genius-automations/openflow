import { strip } from '../lib/ansi.js';
import { VirtualTerminal } from '../lib/virtual-terminal.js';
import { JsonlReader } from '../lib/jsonl-reader.js';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/* ================================================================
   Types
   ================================================================ */

export type ProcessState = 'busy' | 'idle' | 'waiting_for_input';
export type PromptType = 'choice' | 'confirmation' | 'text' | null;

export interface SessionState {
  sessionId: string;
  processState: ProcessState;
  lastActivity: number; // epoch ms
  promptType: PromptType;
  choices: string[] | null;
}

export interface ExecuteRequest {
  input: string;
  waitFor?: RegExp;
  timeout: number;
  quiescenceMs: number;
  stripAnsi: boolean;
}

export interface ExecuteResult {
  status: 'completed' | 'timeout' | 'pattern_matched';
  output: string;
  durationMs: number;
  state: SessionState;
}

type StateChangeListener = (state: SessionState) => void;
type CleanOutputListener = (text: string) => void;

/* ================================================================
   Prompt detection patterns
   ================================================================ */

const CHOICE_PATTERN = /(?:^|\n)\s*1[.)]\s+.+(?:\n\s*\d+[.)]\s+.+){1,}/;
const CONFIRM_PATTERN = /\((?:Y\/n|y\/N|yes\/no|Yes\/No)\)\s*$/;
const TEXT_PROMPT_PATTERN = /(?:>\s*$|\?\s*$)/;

function detectPrompt(text: string): { type: PromptType; choices: string[] | null } {
  // Only look at the tail of output for prompt detection
  const tail = text.slice(-2000);

  if (CONFIRM_PATTERN.test(tail)) {
    return { type: 'confirmation', choices: ['Yes', 'No'] };
  }

  const choiceMatch = tail.match(CHOICE_PATTERN);
  if (choiceMatch) {
    const lines = choiceMatch[0].trim().split('\n');
    const choices = lines
      .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean);
    return { type: 'choice', choices };
  }

  if (TEXT_PROMPT_PATTERN.test(tail)) {
    return { type: 'text', choices: null };
  }

  return { type: null, choices: null };
}

/* ================================================================
   SessionStateTracker — one per active session
   ================================================================ */

const DEFAULT_QUIESCENCE_MS = 2000;
const JSONL_POLL_INTERVAL_MS = 1000;

const CLAUDE_SESSION_UUID_RE = /Session:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export class SessionStateTracker {
  readonly sessionId: string;

  private _state: ProcessState = 'busy';
  private _promptType: PromptType = null;
  private _choices: string[] | null = null;
  private _lastActivity: number = Date.now();
  private _outputSinceInput: string = '';
  private _claudeSessionId: string | null = null;
  private _projectPath: string | null = null;
  private _preSpawnFiles: Set<string> | null = null;  // JSONL files that existed before spawn
  private _createdAt: number = Date.now();

  // Virtual terminal for rendering TUI output into readable text (prompt detection)
  private _vt: VirtualTerminal = new VirtualTerminal(120, 40);

  // JSONL reader for clean execute output
  private _jsonl: JsonlReader = new JsonlReader();
  private _jsonlMark: number = 0;  // Byte offset at execute start
  private _jsonlPollTimer: ReturnType<typeof setInterval> | null = null;

  // Quiescence timer
  private _quiescenceTimer: ReturnType<typeof setTimeout> | null = null;
  private _quiescenceMs: number = DEFAULT_QUIESCENCE_MS;

  // Execute request lifecycle
  private _pendingExecute: {
    request: ExecuteRequest;
    output: string;
    startTime: number;
    resolve: (result: ExecuteResult) => void;
    reject: (err: Error) => void;
    timeoutTimer: ReturnType<typeof setTimeout>;
    quiescenceTimer: ReturnType<typeof setTimeout> | null;
  } | null = null;

  // Listeners
  private _stateListeners = new Set<StateChangeListener>();
  private _outputListeners = new Set<CleanOutputListener>();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /* ---- Public getters ---- */

  get state(): SessionState {
    return {
      sessionId: this.sessionId,
      processState: this._state,
      lastActivity: this._lastActivity,
      promptType: this._promptType,
      choices: this._choices,
    };
  }

  get hasPendingExecute(): boolean {
    return this._pendingExecute !== null;
  }

  get claudeSessionId(): string | null {
    return this._claudeSessionId;
  }

  /** Set the project path and pre-spawn file snapshot for JSONL file discovery */
  setProjectPath(path: string, preSpawnFiles?: Set<string>): void {
    this._projectPath = path;
    if (preSpawnFiles) {
      this._preSpawnFiles = preSpawnFiles;
    }
  }

  /** Set the JSONL file path for clean execute output */
  setJsonlFile(path: string): void {
    this._jsonl.setFile(path);
    console.log(`  [JSONL] File set for session ${this.sessionId}: ${path}`);
  }

  /**
   * Try to discover the JSONL file by scanning the Claude projects directory.
   * Finds the most recently modified .jsonl file created after this session started.
   */
  private _tryDiscoverJsonlFile(): boolean {
    if (this._jsonl.hasFile()) return true;
    if (!this._projectPath) return false;

    const sanitized = this._projectPath.replace(/\//g, '-');
    const claudeDir = join(homedir(), '.claude', 'projects', sanitized);

    try {
      const preSpawn = this._preSpawnFiles;
      const files = readdirSync(claudeDir)
        .filter(f => f.endsWith('.jsonl') && !f.includes('-topic-'))
        .filter(f => {
          // If we have a pre-spawn snapshot, only consider NEW files
          if (preSpawn) {
            const uuid = f.replace('.jsonl', '');
            return !preSpawn.has(uuid);
          }
          return true;
        })
        .map(f => {
          const fullPath = join(claudeDir, f);
          try {
            const stat = statSync(fullPath);
            return { path: fullPath, mtime: stat.mtimeMs, ctime: stat.ctimeMs };
          } catch {
            return null;
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)
        // Only files created/modified after this session started
        .filter(f => f.ctime >= this._createdAt - 5000)
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        this._jsonl.setFile(files[0].path);
        console.log(`  [JSONL] Discovered file for session ${this.sessionId}: ${files[0].path}`);
        return true;
      }
    } catch {
      // Directory doesn't exist yet
    }

    return false;
  }

  /* ---- PTY data handler (called from session-manager) ---- */

  onData(data: string): void {
    this._lastActivity = Date.now();
    const cleaned = strip(data);
    this._outputSinceInput += cleaned;

    // Feed raw data to virtual terminal (synchronous, in-memory only)
    this._vt.write(data);

    // Capture Claude session UUID from output (first match only)
    if (!this._claudeSessionId) {
      const uuidMatch = cleaned.match(CLAUDE_SESSION_UUID_RE);
      if (uuidMatch) {
        this._claudeSessionId = uuidMatch[1];
      }
    }

    // Transition to busy on any output
    if (this._state !== 'busy') {
      this._setState('busy');
    }

    // Accumulate for pending execute
    if (this._pendingExecute) {
      this._pendingExecute.output += this._pendingExecute.request.stripAnsi ? cleaned : data;

      // Check waitFor pattern
      if (this._pendingExecute.request.waitFor?.test(this._pendingExecute.output)) {
        this._resolveExecute('pattern_matched');
        return;
      }

      // Reset execute-specific quiescence timer (only used when JSONL is NOT available)
      if (!this._jsonl.hasFile()) {
        this._resetExecuteQuiescence();
      }
    }

    // Emit clean output to listeners
    if (cleaned) {
      for (const listener of this._outputListeners) {
        try { listener(cleaned); } catch { /* ignore */ }
      }
    }

    // Reset global quiescence timer
    this._resetQuiescenceTimer();
  }

  /* ---- Execute request lifecycle ---- */

  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    if (this._pendingExecute) {
      throw new Error('Session already has a pending execute request');
    }

    // Try to discover JSONL file if not already set
    this._tryDiscoverJsonlFile();

    // Mark current JSONL file position — on resolve we read new entries after this
    this._jsonlMark = await this._jsonl.mark();
    const hasJsonl = this._jsonl.hasFile();

    console.log(`  [EXEC] Starting execute for session ${this.sessionId} (JSONL: ${hasJsonl}, mark: ${this._jsonlMark})`);

    return new Promise<ExecuteResult>((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        this._resolveExecute('timeout');
      }, request.timeout);

      this._pendingExecute = {
        request,
        output: '',
        startTime: Date.now(),
        resolve,
        reject,
        timeoutTimer,
        quiescenceTimer: null,
      };

      // When JSONL is available, poll it for new assistant entries
      // This is the primary completion signal — decoupled from PTY quiescence
      if (hasJsonl) {
        this._startJsonlPolling();
      }
      // Otherwise, quiescence timer will be started on first data (via onData)
    });
  }

  /* ---- JSONL polling — primary completion signal when JSONL is available ---- */

  private _startJsonlPolling(): void {
    this._stopJsonlPolling();
    this._jsonlPollTimer = setInterval(() => {
      this._checkJsonlForCompletion();
    }, JSONL_POLL_INTERVAL_MS);
  }

  private _stopJsonlPolling(): void {
    if (this._jsonlPollTimer) {
      clearInterval(this._jsonlPollTimer);
      this._jsonlPollTimer = null;
    }
  }

  private async _checkJsonlForCompletion(): Promise<void> {
    if (!this._pendingExecute) {
      this._stopJsonlPolling();
      return;
    }

    const entries = await this._jsonl.readSince(this._jsonlMark);
    const text = JsonlReader.extractAssistantText(entries);

    if (text) {
      console.log(`  [JSONL] Found assistant text (${text.length} chars) for session ${this.sessionId}`);
      this._resolveExecute('completed');
    }
  }

  /* ---- Quiescence-based completion (fallback when no JSONL) ---- */

  private _resetExecuteQuiescence(): void {
    if (!this._pendingExecute) return;

    if (this._pendingExecute.quiescenceTimer) {
      clearTimeout(this._pendingExecute.quiescenceTimer);
    }

    this._pendingExecute.quiescenceTimer = setTimeout(() => {
      this._resolveExecute('completed');
    }, this._pendingExecute.request.quiescenceMs);
  }

  /* ---- Resolve execute request ---- */

  private async _resolveExecute(status: ExecuteResult['status']): Promise<void> {
    const pending = this._pendingExecute;
    if (!pending) return;

    let output: string;
    if (pending.request.stripAnsi) {
      // Try JSONL first — always, even on timeout
      const entries = await this._jsonl.readSince(this._jsonlMark);
      output = JsonlReader.extractAssistantText(entries);

      if (output) {
        console.log(`  [EXEC] Resolved via JSONL (${output.length} chars, status=${status})`);
      } else if (this._jsonl.hasFile()) {
        // JSONL file exists but no assistant entry yet
        if (status === 'timeout') {
          // Timeout hit — return empty rather than garbled spinner text
          console.log(`  [EXEC] Timeout with no JSONL content — returning empty output`);
          output = '';
        } else {
          // Quiescence fired but JSONL has nothing — should not happen with polling,
          // but handle gracefully by returning empty
          console.log(`  [EXEC] Quiescence with no JSONL content — returning empty output`);
          output = '';
        }
      } else {
        // No JSONL file at all (pre-UUID-capture) — use raw accumulated output
        console.log(`  [EXEC] No JSONL file — falling back to raw output (${pending.output.length} chars)`);
        output = pending.output;
      }
    } else {
      output = pending.output;
    }

    // Clean up timers
    clearTimeout(pending.timeoutTimer);
    if (pending.quiescenceTimer) clearTimeout(pending.quiescenceTimer);
    this._stopJsonlPolling();
    this._pendingExecute = null;

    pending.resolve({
      status,
      output,
      durationMs: Date.now() - pending.startTime,
      state: this.state,
    });
  }

  /* ---- Quiescence / state machine ---- */

  private _resetQuiescenceTimer(): void {
    if (this._quiescenceTimer) {
      clearTimeout(this._quiescenceTimer);
    }

    this._quiescenceTimer = setTimeout(() => {
      this._onQuiescence();
    }, this._quiescenceMs);
  }

  private _onQuiescence(): void {
    // Detect prompts from the rendered screen (not raw strip-ansi output)
    const screen = this._vt.getScreen();
    const { type, choices } = detectPrompt(screen || this._outputSinceInput);

    if (type) {
      this._promptType = type;
      this._choices = choices;
      this._setState('waiting_for_input');
    } else {
      this._promptType = null;
      this._choices = null;
      this._setState('idle');
    }
  }

  private _setState(newState: ProcessState): void {
    if (this._state === newState) return;
    this._state = newState;

    const snapshot = this.state;
    for (const listener of this._stateListeners) {
      try { listener(snapshot); } catch { /* ignore */ }
    }
  }

  /* ---- Cancel a stuck execute request ---- */

  cancelExecute(): boolean {
    if (!this._pendingExecute) return false;
    const pending = this._pendingExecute;
    clearTimeout(pending.timeoutTimer);
    if (pending.quiescenceTimer) clearTimeout(pending.quiescenceTimer);
    this._stopJsonlPolling();
    this._pendingExecute = null;
    pending.reject(new Error('Execute request cancelled'));
    return true;
  }

  /* ---- Reset output buffer (e.g. after agent sends input) ---- */

  resetOutputBuffer(): void {
    this._outputSinceInput = '';
    this._promptType = null;
    this._choices = null;
  }

  /* ---- Pub/sub ---- */

  onStateChange(listener: StateChangeListener): () => void {
    this._stateListeners.add(listener);
    return () => { this._stateListeners.delete(listener); };
  }

  onCleanOutput(listener: CleanOutputListener): () => void {
    this._outputListeners.add(listener);
    return () => { this._outputListeners.delete(listener); };
  }

  /* ---- Cleanup ---- */

  destroy(): void {
    if (this._quiescenceTimer) clearTimeout(this._quiescenceTimer);
    this._stopJsonlPolling();

    if (this._pendingExecute) {
      clearTimeout(this._pendingExecute.timeoutTimer);
      if (this._pendingExecute.quiescenceTimer) clearTimeout(this._pendingExecute.quiescenceTimer);
      this._pendingExecute.reject(new Error('Session tracker destroyed'));
      this._pendingExecute = null;
    }

    this._vt.dispose();
    this._stateListeners.clear();
    this._outputListeners.clear();
  }
}

/* ================================================================
   Global registry
   ================================================================ */

const trackers = new Map<string, SessionStateTracker>();

export function getOrCreateTracker(sessionId: string): SessionStateTracker {
  let tracker = trackers.get(sessionId);
  if (!tracker) {
    tracker = new SessionStateTracker(sessionId);
    trackers.set(sessionId, tracker);
  }
  return tracker;
}

export function getTracker(sessionId: string): SessionStateTracker | undefined {
  return trackers.get(sessionId);
}

export function removeTracker(sessionId: string): void {
  const tracker = trackers.get(sessionId);
  if (tracker) {
    tracker.destroy();
    trackers.delete(sessionId);
  }
}

/** Replay existing buffer into a fresh tracker to bootstrap state detection */
export function recoverFromBuffer(sessionId: string, buffer: string[]): void {
  const tracker = getOrCreateTracker(sessionId);
  for (const chunk of buffer) {
    tracker.onData(chunk);
  }
}
