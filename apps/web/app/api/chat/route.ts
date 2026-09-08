import { NextRequest } from 'next/server';

import { DEFAULT_CHAT_MODEL, isKnownModel } from '@/lib/ai/models';
import { streamText, type ChatMessage } from '@/lib/ai/workers-ai';
import { rateLimit } from '@/lib/cache/kv';
import {
  createConversation,
  getAgent,
  getConversation,
  insertMessage,
  listMessages,
  touchConversation,
  updateConversation,
} from '@/lib/chat/repository';
import { encodeEvent, type ChatStreamEvent } from '@/lib/chat/stream-protocol';
import { generateTitle } from '@/lib/chat/title';
import { requireSession } from '@/lib/auth/session';

/** Turns per user per minute. Generous for humans, cheap insurance against loops. */
const RATE_LIMIT_PER_MINUTE = 30;
/** Most recent turns replayed as context; keeps us inside the model window. */
const HISTORY_TURNS = 24;

interface ChatRequestBody {
  message: string;
  conversationId?: string;
  agentId?: string;
  model?: string;
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return errorResponse('Unauthorized', 401);
  }
  const userId = session.user.id;

  const body = (await request.json()) as ChatRequestBody;
  const prompt = body.message?.trim();
  if (!prompt) return errorResponse('message is required', 400);

  const limit = await rateLimit(`chat:${userId}`, RATE_LIMIT_PER_MINUTE, 60);
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many messages. Try again shortly.', resetAt: limit.resetAt },
      { headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) }, status: 429 },
    );
  }

  // Resolve the thread, creating one on the first turn so the client can start
  // from an empty composer without a separate round trip.
  let conversation = body.conversationId ? await getConversation(userId, body.conversationId) : null;
  if (body.conversationId && !conversation) return errorResponse('Conversation not found', 404);

  const isNewConversation = !conversation;
  if (!conversation) {
    conversation = await createConversation(userId, { agentId: body.agentId ?? null });
  }

  const agent = conversation.agentId ? await getAgent(userId, conversation.agentId) : null;
  const model =
    body.model && isKnownModel(body.model) ? body.model : agent?.model ?? DEFAULT_CHAT_MODEL;

  const history = await listMessages(conversation.id, HISTORY_TURNS);
  const userMessage = await insertMessage({
    content: prompt,
    conversationId: conversation.id,
    role: 'user',
    userId,
  });

  const promptMessages: ChatMessage[] = [
    ...(agent?.systemRole ? [{ content: agent.systemRole, role: 'system' as const }] : []),
    ...history
      .filter((message) => message.role !== 'tool' && !message.error)
      .map((message) => ({ content: message.content, role: message.role as ChatMessage['role'] })),
    { content: prompt, role: 'user' as const },
  ];

  const assistantMessageId = crypto.randomUUID();
  const conversationId = conversation.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => controller.enqueue(encoder.encode(encodeEvent(event)));

      send({
        assistantMessageId,
        conversationId,
        type: 'start',
        userMessageId: userMessage.id,
      });

      let answer = '';
      try {
        const deltas = await streamText({
          maxTokens: agent?.maxTokens ?? undefined,
          messages: promptMessages,
          model,
          signal: request.signal,
          temperature: agent?.temperature ?? undefined,
          topP: agent?.topP ?? undefined,
        });

        const reader = deltas.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += value;
          send({ text: value, type: 'delta' });
        }

        await insertMessage({
          content: answer,
          conversationId,
          model,
          role: 'assistant',
          userId,
        });
        await touchConversation(conversationId);

        // Title the thread once there is something to summarize. Doing it after
        // the answer keeps first-token latency untouched.
        if (isNewConversation) {
          const title = await generateTitle(prompt);
          await updateConversation(userId, conversationId, { title });
          send({ title, type: 'title' });
        }

        send({ content: answer, type: 'done' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Generation failed';
        // Persist the failure so the thread shows what happened on reload
        // instead of silently losing the turn.
        await insertMessage({
          content: answer,
          conversationId,
          error: message,
          model,
          role: 'assistant',
          userId,
        });
        await touchConversation(conversationId);
        send({ message, type: 'error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Conversation-Id': conversationId,
      // Nginx-style proxies in front of the Worker must not buffer SSE.
      'X-Accel-Buffering': 'no',
    },
  });
}
