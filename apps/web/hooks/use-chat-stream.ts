'use client';

import { useCallback, useRef, useState } from 'react';

import { createEventParser } from '@/lib/chat/stream-protocol';

export interface ChatUiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: string;
  /** True while the assistant turn is still streaming. */
  streaming?: boolean;
}

export interface UseChatStreamOptions {
  conversationId?: string;
  initialMessages?: ChatUiMessage[];
  /** Fired once the server has assigned an id to a brand-new thread. */
  onConversationCreated?: (conversationId: string) => void;
  onTitle?: (title: string) => void;
}

/**
 * Client for `POST /api/chat`.
 *
 * Written against our own SSE protocol (`lib/chat/stream-protocol.ts`) rather
 * than a vendor chat SDK, so the client stays in step with the Workers AI
 * server without a protocol adapter in between.
 */
export function useChatStream(options: UseChatStreamOptions = {}) {
  const [messages, setMessages] = useState<ChatUiMessage[]>(options.initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversationIdRef = useRef(options.conversationId);
  const abortRef = useRef<AbortController | null>(null);

  const patchMessage = useCallback((id: string, patch: Partial<ChatUiMessage>) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, ...patch } : message)),
    );
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (text: string, model?: string) => {
      const prompt = text.trim();
      if (!prompt || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      // Optimistic user turn with a temporary id; the server's id replaces it
      // on the `start` frame so retries and edits address the persisted row.
      const optimisticId = `pending-${crypto.randomUUID()}`;
      setMessages((current) => [...current, { content: prompt, id: optimisticId, role: 'user' }]);

      const controller = new AbortController();
      abortRef.current = controller;

      let assistantId = `pending-assistant-${crypto.randomUUID()}`;
      setMessages((current) => [
        ...current,
        { content: '', id: assistantId, role: 'assistant', streaming: true },
      ]);

      try {
        const response = await fetch('/api/chat', {
          body: JSON.stringify({
            conversationId: conversationIdRef.current,
            message: prompt,
            model,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? `Request failed (${response.status})`);
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        const parse = createEventParser();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          for (const event of parse(value)) {
            switch (event.type) {
              case 'start': {
                if (!conversationIdRef.current) {
                  conversationIdRef.current = event.conversationId;
                  options.onConversationCreated?.(event.conversationId);
                }
                patchMessage(optimisticId, { id: event.userMessageId });
                const previousAssistantId = assistantId;
                assistantId = event.assistantMessageId;
                patchMessage(previousAssistantId, { id: event.assistantMessageId });
                break;
              }
              case 'delta': {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === assistantId
                      ? { ...message, content: message.content + event.text }
                      : message,
                  ),
                );
                break;
              }
              case 'title': {
                options.onTitle?.(event.title);
                break;
              }
              case 'done': {
                patchMessage(assistantId, { streaming: false });
                break;
              }
              case 'error': {
                patchMessage(assistantId, { error: event.message, streaming: false });
                setError(event.message);
                break;
              }
            }
          }
        }
      } catch (caught) {
        if (controller.signal.aborted) {
          // A user-initiated stop keeps whatever text already arrived.
          patchMessage(assistantId, { streaming: false });
        } else {
          const message = caught instanceof Error ? caught.message : 'Something went wrong';
          patchMessage(assistantId, { error: message, streaming: false });
          setError(message);
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [isStreaming, options, patchMessage],
  );

  return { error, isStreaming, messages, send, setMessages, stop };
}
