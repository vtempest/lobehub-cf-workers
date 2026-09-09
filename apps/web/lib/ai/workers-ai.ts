/**
 * Workers AI client.
 *
 * Inference runs on the `AI` binding, optionally through an AI Gateway when
 * `AI_GATEWAY_ID` is set. The binding streams back Server-Sent Events; this
 * module turns that into a plain `ReadableStream<string>` of text deltas so
 * callers never touch the wire format.
 */
import { getBindings } from '../cf/bindings';
import { UTILITY_MODEL } from './models';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
}

/** Shape of one SSE `data:` payload from Workers AI. */
interface AiStreamChunk {
  response?: string;
}

function gatewayOptions() {
  const id = getBindings().AI_GATEWAY_ID;
  return id ? { gateway: { id } } : undefined;
}

function runInput(options: GenerateOptions) {
  return {
    max_tokens: options.maxTokens ?? undefined,
    messages: options.messages,
    temperature: options.temperature ?? undefined,
    top_p: options.topP ?? undefined,
  };
}

/**
 * Stream a completion as text deltas.
 *
 * The returned stream closes when the model is done. Aborting `signal` cancels
 * it; whatever text already arrived stays with the caller.
 */
export async function streamText(options: GenerateOptions): Promise<ReadableStream<string>> {
  const { AI } = getBindings();
  const model = options.model ?? UTILITY_MODEL;

  const raw = (await AI.run(
    model as Parameters<typeof AI.run>[0],
    { ...runInput(options), stream: true } as never,
    gatewayOptions() as never,
  )) as unknown as ReadableStream<Uint8Array>;

  return decodeSseText(raw, options.signal);
}

/** Run a completion to completion and return the whole answer. */
export async function generateText(options: GenerateOptions): Promise<string> {
  const { AI } = getBindings();
  const model = options.model ?? UTILITY_MODEL;

  const result = (await AI.run(
    model as Parameters<typeof AI.run>[0],
    runInput(options) as never,
    gatewayOptions() as never,
  )) as { response?: string };

  return result?.response?.trim() ?? '';
}

/**
 * Turn the binding's SSE byte stream into text deltas.
 *
 * Frames can be split across chunk boundaries, so a partial tail is carried
 * over rather than parsed; a frame that does not parse is skipped instead of
 * failing the turn, since dropping one delta beats losing the answer.
 */
function decodeSseText(
  source: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): ReadableStream<string> {
  // Decoded by hand rather than through TextDecoderStream: the DOM and Workers
  // stream typings disagree on the pair's element type, and a stateful decoder
  // handles a multi-byte character split across chunks just as well.
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream<string>({
    async cancel(reason) {
      await reader.cancel(reason);
    },
    async pull(controller) {
      if (signal?.aborted) {
        await reader.cancel('aborted');
        controller.close();
        return;
      }

      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      // The last element is either empty or an incomplete frame.
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const chunk = JSON.parse(payload) as AiStreamChunk;
            if (chunk.response) controller.enqueue(chunk.response);
          } catch {
            // Not a JSON frame (a comment or keep-alive) — nothing to emit.
          }
        }
      }
    },
  });
}
