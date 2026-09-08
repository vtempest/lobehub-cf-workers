import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from '@/lib/ai/models';

/**
 * The model catalog is a static list of Workers AI ids, so it is safe to cache
 * at the edge rather than recompute per request.
 */
export function GET() {
  return Response.json(
    { data: CHAT_MODELS, default: DEFAULT_CHAT_MODEL },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
