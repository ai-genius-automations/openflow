/**
 * Voice command event bus.
 * Bridges Electron IPC voice command events to React component handlers.
 */

export interface VoiceCommandPayload {
  commandId: string;
  action: {
    kind: string;
    target?: string;
    sessionType?: string;
    command?: string;
    background?: boolean;
  };
  param: string;
  rawText: string;
}

type CommandHandler = (payload: VoiceCommandPayload) => void;

const handlers = new Set<CommandHandler>();

export function onVoiceCommand(handler: CommandHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitVoiceCommand(payload: VoiceCommandPayload) {
  for (const handler of handlers) {
    handler(payload);
  }
}
