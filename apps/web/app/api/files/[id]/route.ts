import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { deleteObject, getObject } from '@/lib/storage/r2';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Look the row up scoped to the caller, so an object key alone grants nothing. */
async function findOwnedFile(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const row = await findOwnedFile(session.user.id, id);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });

  const object = await getObject(row.key);
  if (!object) return Response.json({ error: 'Object missing from storage' }, { status: 404 });

  return new Response(object.body, {
    headers: {
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.name)}"`,
      'Content-Type': row.contentType,
      ETag: object.httpEtag,
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const row = await findOwnedFile(session.user.id, id);
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });

  await deleteObject(row.key);
  await getDb().delete(files).where(eq(files.id, id));

  return Response.json({ success: true });
}
