'use client';

import { useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  placeholder?: string;
}

export function Composer({ isStreaming, onSend, onStop, placeholder }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setValue('');
    // Reset the auto-grow height with the value, or the box stays tall.
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a newline — the convention every chat UI uses.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    const element = event.target;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t bg-background/80 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl px-4 py-3">
        <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
          <Textarea
            className="max-h-[200px] min-h-[40px] resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0"
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? 'Send a message…'}
            ref={textareaRef}
            rows={1}
            value={value}
          />
          {isStreaming ? (
            <Button aria-label="Stop generating" onClick={onStop} size="icon" variant="secondary">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button aria-label="Send message" disabled={!value.trim()} onClick={submit} size="icon">
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Responses are generated on Cloudflare Workers AI and may be inaccurate.
        </p>
      </div>
    </div>
  );
}
