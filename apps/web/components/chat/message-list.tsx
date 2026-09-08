'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, Bot, User } from 'lucide-react';

import type { ChatUiMessage } from '@/hooks/use-chat-stream';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: ChatUiMessage[];
  emptyState?: React.ReactNode;
}

export function MessageList({ messages, emptyState }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the tail as tokens stream in. `auto` rather than `smooth`: a smooth
  // scroll per token fights itself and lags behind the text.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages]);

  if (messages.length === 0 && emptyState) {
    return <div className="flex h-full items-center justify-center p-8">{emptyState}</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function Message({ message }: { message: ChatUiMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn('min-w-0 flex-1 space-y-2', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {message.content}
          {message.streaming && message.content.length === 0 && (
            <span className="inline-flex gap-1 py-1" aria-label="Generating response">
              <Dot delay="0ms" />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </span>
          )}
        </div>

        {message.error && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {message.error}
          </p>
        )}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
      style={{ animationDelay: delay }}
    />
  );
}
