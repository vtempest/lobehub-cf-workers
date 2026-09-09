/**
 * The SSE protocol spoken by `POST /api/chat`.
 *
 * Purpose-built rather than a vendor chat-SDK format: the server is Workers AI
 * end to end, so there is no upstream shape to mirror, and owning the frames
 * keeps the client hook dependency-free.
 *
 *   data: {"type":"start","conversationId":…,"userMessageId":…,"assistantMessageId":…}
 *   data: {"type":"delta","text":"…"}
 *   data: {"type":"title","title":"…"}      // first turn of a new thread only
 *   data: {"type":"done","content":"…"}
 *   data: {"type":"error","message":"…"}
 */

export type ChatStreamEvent =
  | {
      type: 'start';
      conversationId: string;
      userMessageId: string;
      assistantMessageId: string;
    }
  | { type: 'delta'; text: string }
  | { type: 'title'; title: string }
  | { type: 'done'; content: string }
  | { type: 'error'; message: string };

/** Encode one event as an SSE frame. */
export function encodeEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * A stateful parser for the client side of the protocol.
 *
 * Call the returned function with each decoded chunk; it returns the events
 * that completed in it. Frames split across chunk boundaries are held until the
 * rest arrives, and a frame that does not parse is dropped rather than throwing
 * — one lost delta beats a failed stream.
 */
export function createEventParser(): (chunk: string) => ChatStreamEvent[] {
  let buffer = '';

  return (chunk: string) => {
    buffer += chunk;

    const frames = buffer.split('\n\n');
    // The last element is either empty or an incomplete frame.
    buffer = frames.pop() ?? '';

    const events: ChatStreamEvent[] = [];
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;

        try {
          events.push(JSON.parse(payload) as ChatStreamEvent);
        } catch {
          // Malformed frame — skip it.
        }
      }
    }
    return events;
  };
}
