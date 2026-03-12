import { FastifyPluginAsync } from 'fastify';
import { getDb } from '../db/index.js';
import { nanoid } from 'nanoid';

export const taskRoutes: FastifyPluginAsync = async (app) => {
  // List tasks
  app.get<{
    Querystring: { status?: string; project_id?: string };
  }>('/tasks', async (req) => {
    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (req.query.status) {
      conditions.push('status = ?');
      params.push(req.query.status);
    }
    if (req.query.project_id) {
      conditions.push('project_id = ?');
      params.push(req.query.project_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const tasks = db.prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT 50`).all(...params);
    return { tasks };
  });

  // Create a task
  app.post<{
    Body: {
      project_id?: string;
      title: string;
      description?: string;
      priority?: number;
    };
  }>('/tasks', async (req, reply) => {
    const { project_id, title, description, priority } = req.body;

    if (!title) {
      return reply.status(400).send({ error: 'title is required' });
    }

    const db = getDb();
    const id = nanoid(12);

    db.prepare(`
      INSERT INTO tasks (id, project_id, title, description, priority)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, project_id || null, title, description || null, priority || 0);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return { ok: true, task };
  });

  // Update task status
  app.patch<{
    Params: { id: string };
    Body: { status: string };
  }>('/tasks/:id', async (req, reply) => {
    const db = getDb();
    const result = db.prepare('UPDATE tasks SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(req.body.status, req.params.id);

    if (result.changes === 0) return reply.status(404).send({ error: 'Task not found' });
    return { ok: true };
  });
};
