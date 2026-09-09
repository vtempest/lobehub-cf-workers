/**
 * R2 object storage for user uploads.
 *
 * Only metadata lands in D1 (`files`); the bytes live here. Keys are prefixed
 * per user so a listing can never span accounts, but the prefix is not the
 * access check — callers look the row up scoped to the caller first.
 */
import { getBindings } from '../cf/bindings';

/** Keep object keys to characters that are safe in a URL and a bucket listing. */
function sanitizeName(name: string): string {
  const cleaned = name
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return cleaned.slice(0, 100) || 'file';
}

/**
 * Key for one upload: `users/<userId>/<fileId>/<name>`.
 *
 * The file id sits between the user and the name so two uploads of the same
 * filename never collide.
 */
export function objectKey(userId: string, fileId: string, name: string): string {
  return `users/${userId}/${fileId}/${sanitizeName(name)}`;
}

export async function putObject(
  key: string,
  body: ArrayBuffer | ReadableStream,
  contentType: string,
): Promise<void> {
  await getBindings().FILES.put(key, body, {
    httpMetadata: { contentType },
  });
}

export async function getObject(key: string): Promise<R2ObjectBody | null> {
  return getBindings().FILES.get(key);
}

export async function deleteObject(key: string): Promise<void> {
  await getBindings().FILES.delete(key);
}
