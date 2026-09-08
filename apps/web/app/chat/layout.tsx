import { redirect } from 'next/navigation';

import { ConversationList } from '@/components/chat/conversation-list';
import { getSession } from '@/lib/auth/session';
import { listConversations } from '@/lib/chat/repository';

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const conversations = await listConversations(session.user.id);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r md:block">
        <ConversationList
          conversations={conversations.map(({ id, pinned, title }) => ({ id, pinned, title }))}
        />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
