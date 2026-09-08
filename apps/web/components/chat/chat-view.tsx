'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Composer } from '@/components/chat/composer';
import { MessageList } from '@/components/chat/message-list';
import { ModelPicker } from '@/components/chat/model-picker';
import { useChatStream, type ChatUiMessage } from '@/hooks/use-chat-stream';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { APP_NAME } from '@/lib/constants';

interface ChatViewProps {
  conversationId?: string;
  initialMessages?: ChatUiMessage[];
}

export function ChatView({ conversationId, initialMessages }: ChatViewProps) {
  const router = useRouter();
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);

  const { error, isStreaming, messages, send, stop } = useChatStream({
    conversationId,
    initialMessages,
    // A brand-new thread gets its URL from the server's first frame, so the
    // address bar matches what was persisted without an extra fetch.
    onConversationCreated: (id) => {
      window.history.replaceState(null, '', `/chat/${id}`);
    },
    // The generated title lands in the sidebar, which is server-rendered.
    onTitle: () => router.refresh(),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <ModelPicker onChange={setModel} value={model} />
        {error && <span className="text-xs text-destructive">{error}</span>}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <MessageList
          emptyState={
            <div className="max-w-md text-center">
              <h2 className="text-xl font-semibold">Start a conversation</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {APP_NAME} runs entirely on Cloudflare — Workers AI for inference, D1 for your
                history, R2 for attachments. Ask anything to begin.
              </p>
            </div>
          }
          messages={messages}
        />
      </div>

      <Composer
        isStreaming={isStreaming}
        onSend={(text) => send(text, model)}
        onStop={stop}
      />
    </div>
  );
}
