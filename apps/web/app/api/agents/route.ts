import { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/session';
import { createAgent, listAgents } from '@/lib/chat/repository';

export async function GET() {
  try {
    const session = await requireSession();
    return Response.json({ data: await listAgents(session.user.id) });
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

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    systemRole?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };

  if (!body.title?.trim()) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  const agent = await createAgent(session.user.id, { ...body, title: body.title.trim() });
  return Response.json({ data: agent }, { status: 201 });
}
