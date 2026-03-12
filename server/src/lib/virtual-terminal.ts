import xtermHeadless from '@xterm/headless';
const { Terminal } = xtermHeadless;

/**
 * Sequences stripped to make the VT append-only for TUI apps like Claude Code.
 *
 * TUI apps redraw the entire screen by: cursor-home → write 40 lines → repeat.
 * Each redraw overwrites the previous viewport content. By stripping backward
 * cursor movement and screen clears, each "redraw" appends below the previous
 * one instead of overwriting it.
 *
 * Stripped:
 *   - Alt buffer switches (no scrollback in alt buffer)
 *   - Cursor home / absolute positioning (prevents overwriting earlier lines)
 *   - Cursor up (prevents moving back to overwrite)
 *   - Clear screen / erase display (prevents wiping content)
 *
 * Kept:
 *   - Cursor down/right/left (forward/inline movement)
 *   - Erase in line (needed for line-level formatting)
 *   - Color/style codes (stripped later by strip-ansi if needed)
 *   - Line feeds / carriage returns (normal text flow)
 */
const STRIP_RE = new RegExp(
  [
    '\\x1b\\[\\?(1049|1047|47)[hl]',    // Alt buffer switches
    '\\x1b\\[\\d*(?:;\\d*)*[Hf]',        // Cursor position / home (CSI n;m H/f)
    '\\x1b\\[\\d*A',                      // Cursor up (CSI n A)
    '\\x1b\\[\\d*J',                      // Erase in display / clear screen (CSI n J)
  ].join('|'),
  'g'
);

export class VirtualTerminal {
  private term: InstanceType<typeof Terminal>;
  private _writeQueue: Promise<void> = Promise.resolve();

  constructor(cols = 120, rows = 40) {
    this.term = new Terminal({
      cols,
      rows,
      scrollback: 50000,
      allowProposedApi: true,
    });
  }

  /** Feed raw PTY data into the virtual terminal */
  write(data: string): void {
    // Strip sequences that cause backward movement / overwrites
    const cleaned = data.replace(STRIP_RE, '');
    if (!cleaned) return;

    this._writeQueue = this._writeQueue.then(
      () => new Promise<void>((resolve) => {
        this.term.write(cleaned, resolve);
      })
    );
  }

  /** Wait for all pending writes to flush */
  async flush(): Promise<void> {
    await this._writeQueue;
  }

  /**
   * Read the current visible screen content as clean text.
   * Used for prompt detection (getScreen + detectPrompt).
   */
  getScreen(): string {
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < this.term.rows; i++) {
      const line = buffer.getLine(i + buffer.baseY);
      if (line) lines.push(line.translateToString(true));
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    return lines.join('\n');
  }

  /** Resize the virtual terminal */
  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows);
  }

  /** Clean up */
  dispose(): void {
    this.term.dispose();
  }
}
