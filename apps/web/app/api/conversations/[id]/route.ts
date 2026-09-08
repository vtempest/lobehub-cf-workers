import { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/session';
import {
  deleteConversation,
  getConversation,
  listMessages,
  updateConversation,
} from '@/lib/chat/repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversation(session.user.id, id);
  if (!conversation) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json({ data: { conversation, messages: await listMessages(id) } });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!(await getConversation(session.user.id, id))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json()) as { title?: string; pinned?: boolean; archived?: boolean };
  await updateConversation(session.user.id, id, body);

  return Response.json({ success: true });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!(await getConversation(session.user.id, id))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  await deleteConversation(session.user.id, id);
  return Response.json({ success: true });
}
