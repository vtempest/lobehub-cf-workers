import { notFound, redirect } from 'next/navigation';

import { ChatView } from '@/components/chat/chat-view';
import { getSession } from '@/lib/auth/session';
import { getConversation, listMessages } from '@/lib/chat/repository';
import type { ChatUiMessage } from '@/hooks/use-chat-stream';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const conversation = await getConversation(session.user.id, id);
  if (!conversation) notFound();

  const rows = await listMessages(id);
  const initialMessages: ChatUiMessage[] = rows
    // `tool` and `system` rows are transcript plumbing, not turns to render.
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({
      content: row.content,
      error: row.error ?? undefined,
      id: row.id,
      role: row.role as 'user' | 'assistant',
    }));

  return <ChatView conversationId={id} initialMessages={initialMessages} />;
}
