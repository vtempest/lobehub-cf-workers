import { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/session';
import { createConversation, listConversations } from '@/lib/chat/repository';

export async function GET() {
  try {
    const session = await requireSession();
    return Response.json({ data: await listConversations(session.user.id) });
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { title?: string; agentId?: string };
  const conversation = await createConversation(session.user.id, {
    agentId: body.agentId ?? null,
    title: body.title,
  });

  return Response.json({ data: conversation }, { status: 201 });
}
