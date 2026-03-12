import { FastifyPluginAsync } from 'fastify';
import { subscribe } from '../services/event-store.js';

/**
 * WebSocket stream for real-time events to the dashboard
 */
export const streamRoutes: FastifyPluginAsync = async (app) => {
  app.get('/stream', { websocket: true }, (socket, _req) => {
    // Subscribe to events
    const unsubscribe = subscribe((event) => {
      try {
        socket.send(JSON.stringify(event));
      } catch {
        // Socket closed
      }
    });

    socket.on('close', () => {
      unsubscribe();
    });

    // Send initial ping
    socket.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  });
};
