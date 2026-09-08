'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MessageSquare, Pin, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ConversationListItem {
  id: string;
  title: string;
  pinned: boolean;
}

interface ConversationListProps {
  conversations: ConversationListItem[];
  activeId?: string;
}

export function ConversationList({ activeId, conversations }: ConversationListProps) {
  const router = useRouter();
  const [items, setItems] = useState(conversations);
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setBusyId(id);
    const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    setBusyId(null);
    if (!response.ok) return;

    setItems((current) => current.filter((item) => item.id !== id));
    if (id === activeId) router.push('/chat');
    else router.refresh();
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Button asChild className="w-full justify-start gap-2" variant="outline">
        <Link href="/chat">
          <Plus className="h-4 w-4" />
          New chat
        </Link>
      </Button>

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Your conversations will appear here.
          </p>
        ) : (
          items.map((item) => (
            <div
              className={cn(
                'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                item.id === activeId && 'bg-accent',
                busyId === item.id && 'opacity-50',
              )}
              key={item.id}
            >
              {item.pinned ? (
                <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <Link className="min-w-0 flex-1 truncate" href={`/chat/${item.id}`} title={item.title}>
                {item.title}
              </Link>
              <button
                aria-label={`Delete ${item.title}`}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                disabled={busyId === item.id}
                onClick={() => remove(item.id)}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}
