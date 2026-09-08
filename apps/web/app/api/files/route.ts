import { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { objectKey, putObject } from '@/lib/storage/r2';

/** Workers stream request bodies, but D1 metadata and UI previews assume sane sizes. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: 'File exceeds the 25 MB limit' }, { status: 413 });
  }

  const conversationId = form.get('conversationId');
  const id = crypto.randomUUID();
  const key = objectKey(session.user.id, id, file.name);

  await putObject(key, await file.arrayBuffer(), file.type || 'application/octet-stream');

  const row = {
    contentType: file.type || 'application/octet-stream',
    conversationId: typeof conversationId === 'string' ? conversationId : null,
    createdAt: new Date(),
    id,
    key,
    name: file.name,
    size: file.size,
    userId: session.user.id,
  };
  await getDb().insert(files).values(row);

  return Response.json({ data: { ...row, url: `/api/files/${id}` } }, { status: 201 });
}
