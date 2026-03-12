import { create } from 'zustand';
import type { QueryClient } from '@tanstack/react-query';
import type { Event } from './api';

let queryClientRef: QueryClient | null = null;

export function setQueryClient(qc: QueryClient) {
  queryClientRef = qc;
}

interface StreamState {
  events: Event[];
  connected: boolean;
  addEvent: (event: Event) => void;
  setConnected: (connected: boolean) => void;
  clearEvents: () => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  events: [],
  connected: false,
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 500), // Keep last 500
    })),
  setConnected: (connected) => set({ connected }),
  clearEvents: () => set({ events: [] }),
}));

let ws: WebSocket | null = null;

export function connectStream() {
  if (ws) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/api/stream`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    useStreamStore.getState().setConnected(true);
  };

  ws.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data);
      useStreamStore.getState().addEvent(event);
      // Invalidate sessions query on session lifecycle events so we don't need aggressive polling
      if (event.type?.startsWith('session.') && queryClientRef) {
        queryClientRef.invalidateQueries({ queryKey: ['sessions'] });
      }
    } catch {
      // Ignore parse errors
    }
  };

  ws.onclose = () => {
    useStreamStore.getState().setConnected(false);
    ws = null;
    // Reconnect after 3s
    setTimeout(connectStream, 3000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}
