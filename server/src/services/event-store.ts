import { getDb } from '../db/index.js';

export interface Event {
  id: number;
  session_id: string | null;
  type: string;
  tool_name: string | null;
  data: string | null;
  timestamp: string;
}

export interface EventInput {
  session_id?: string;
  project_id?: string;
  type: string;
  tool_name?: string;
  data?: Record<string, unknown>;
}

// Listeners for real-time streaming
type EventListener = (event: Event) => void;
const listeners = new Set<EventListener>();

export function subscribe(listener: EventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(event: Event) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Don't let one bad listener kill the stream
    }
  }
}

export function insertEvent(input: EventInput): Event {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO events (session_id, project_id, type, tool_name, data)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    input.session_id || null,
    input.project_id || null,
    input.type,
    input.tool_name || null,
    input.data ? JSON.stringify(input.data) : null
  );

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid) as Event;
  notifyListeners(event);
  return event;
}

export function getEvents(options?: {
  session_id?: string;
  project_id?: string;
  type?: string;
  limit?: number;
  since?: string;
}): Event[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.session_id) {
    conditions.push('session_id = ?');
    params.push(options.session_id);
  }
  if (options?.project_id) {
    conditions.push('project_id = ?');
    params.push(options.project_id);
  }
  if (options?.type) {
    conditions.push('type = ?');
    params.push(options.type);
  }
  if (options?.since) {
    conditions.push('timestamp > ?');
    params.push(options.since);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit || 100;

  return db.prepare(`SELECT * FROM events ${where} ORDER BY id DESC LIMIT ?`).all(...params, limit) as Event[];
}
