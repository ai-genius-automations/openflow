import { stat, open } from 'fs/promises';
import type { FileHandle } from 'fs/promises';

export interface JsonlEntry {
  type: string;
  message?: { content: Array<{ type: string; text?: string }> };
  result?: string;
  [key: string]: unknown;
}

export class JsonlReader {
  private filePath: string | null = null;

  setFile(path: string): void {
    this.filePath = path;
  }

  /** Whether a JSONL file path has been set */
  hasFile(): boolean {
    return this.filePath !== null;
  }

  /** Return current file size in bytes (async, non-blocking). */
  async mark(): Promise<number> {
    if (!this.filePath) return 0;
    try {
      const st = await stat(this.filePath);
      return st.size;
    } catch {
      return 0;
    }
  }

  /** Read new JSONL entries appended since the given byte offset (async, non-blocking). */
  async readSince(markOffset: number): Promise<JsonlEntry[]> {
    if (!this.filePath) return [];
    try {
      const st = await stat(this.filePath);
      if (st.size <= markOffset) return [];

      const length = st.size - markOffset;
      const buf = Buffer.alloc(length);
      let fh: FileHandle | null = null;
      try {
        fh = await open(this.filePath, 'r');
        await fh.read(buf, 0, length, markOffset);
      } finally {
        await fh?.close();
      }

      const text = buf.toString('utf-8');
      const entries: JsonlEntry[] = [];
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed));
        } catch {
          // Skip malformed lines (e.g. partial write at EOF)
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  /** Extract clean assistant/result text from JSONL entries. */
  static extractAssistantText(entries: JsonlEntry[]): string {
    const parts: string[] = [];

    for (const entry of entries) {
      if (entry.type === 'assistant' && entry.message?.content) {
        for (const block of entry.message.content) {
          if (block.type === 'text' && block.text) {
            parts.push(block.text);
          }
        }
      } else if (entry.type === 'result' && typeof entry.result === 'string') {
        parts.push(entry.result);
      }
    }

    return parts.join('\n');
  }
}
