/**
 * The Workers AI model catalog.
 *
 * Ids are Cloudflare model names, passed straight to the `AI` binding. Keeping
 * the list static (rather than querying the account's catalog) means the model
 * picker and `/api/models` are free to render and cache.
 */

export interface ChatModel {
  /** Workers AI model id, e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. */
  id: string;
  displayName: string;
  description: string;
  /** Context window in tokens, for sizing replayed history. */
  contextWindow: number;
}

export const CHAT_MODELS: ChatModel[] = [
  {
    contextWindow: 24_000,
    description: 'Fast and capable. The default for everyday chat.',
    displayName: 'Llama 3.3 70B',
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  },
  {
    contextWindow: 128_000,
    description: 'Long context, strong reasoning. Slower and pricier per turn.',
    displayName: 'Llama 4 Scout 17B',
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
  },
  {
    contextWindow: 32_000,
    description: 'Tuned for code and structured output.',
    displayName: 'Qwen 2.5 Coder 32B',
    id: '@cf/qwen/qwen2.5-coder-32b-instruct',
  },
  {
    contextWindow: 8_000,
    description: 'Small and cheap. Good for short questions and drafts.',
    displayName: 'Llama 3.1 8B',
    id: '@cf/meta/llama-3.1-8b-instruct-fast',
  },
];

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;

/**
 * Model used for background utility work — thread titles and the like. Small on
 * purpose: these calls are on the critical path of nothing the user is reading.
 */
export const UTILITY_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

/** Embeddings, for the optional Vectorize index. */
export const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
/** Must match the `--dimensions` the Vectorize index was created with. */
export const EMBEDDING_DIMENSIONS = 768;

const KNOWN_MODEL_IDS = new Set(CHAT_MODELS.map((model) => model.id));

/**
 * Whether a client-supplied model id is one we serve. Requests naming anything
 * else fall back to the agent's model rather than being passed to the binding.
 */
export function isKnownModel(id: string): boolean {
  return KNOWN_MODEL_IDS.has(id);
}

export function getModel(id: string): ChatModel | undefined {
  return CHAT_MODELS.find((model) => model.id === id);
}
