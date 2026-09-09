/**
 * Data access for agents, conversations and messages.
 *
 * Every query runs through `getDb()`, so it participates in the request's D1
 * session and sees one consistent view of the database — see
 * lib/db/d1-session.ts. Reads are scoped by `userId` at the query level rather
 * than checked afterwards, so an id alone never grants access to another
 * account's row.
 */
import { and, asc, desc, eq } from 'drizzle-orm';

import { getDb } from '../db';
import {
  agents,
  conversations,
  messages,
  type Agent,
  type Conversation,
  type Message,
} from '../db/schema';

/** Newest threads first; a thread that has no messages yet sorts by creation. */
export async function listConversations(userId: string): Promise<Conversation[]> {
  return getDb()
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.archived, false)))
    .orderBy(desc(conversations.pinned), desc(conversations.lastMessageAt), desc(conversations.createdAt));
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  const [row] = await getDb()
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createConversation(
  userId: string,
  options: { agentId?: string | null; title?: string } = {},
): Promise<Conversation> {
  const now = new Date();
  const row = {
    agentId: options.agentId ?? null,
    archived: false,
    createdAt: now,
    id: crypto.randomUUID(),
    lastMessageAt: now,
    pinned: false,
    title: options.title?.trim() || 'New conversation',
    updatedAt: now,
    userId,
  };

  await getDb().insert(conversations).values(row);
  return row as Conversation;
}

export async function updateConversation(
  userId: string,
  id: string,
  patch: { title?: string; pinned?: boolean; archived?: boolean },
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.pinned !== undefined) set.pinned = patch.pinned;
  if (patch.archived !== undefined) set.archived = patch.archived;

  await getDb()
    .update(conversations)
    .set(set)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

/**
 * Delete a thread. Messages and attachments go with it through the schema's
 * `on delete cascade`, so this is one statement rather than a fan-out.
 */
export async function deleteConversation(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

/** Mark a thread as freshly active, so it sorts to the top of the sidebar. */
export async function touchConversation(id: string): Promise<void> {
  const now = new Date();
  await getDb()
    .update(conversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(conversations.id, id));
}

/**
 * Transcript for a thread, oldest first.
 *
 * With `limit` set the *most recent* rows are taken and then reversed, so
 * replayed history is the tail of the conversation rather than its opening.
 */
export async function listMessages(conversationId: string, limit?: number): Promise<Message[]> {
  if (limit === undefined) {
    return getDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
  }

  const recent = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return recent.reverse();
}

export async function insertMessage(input: {
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  model?: string;
  error?: string;
  reasoning?: string;
  toolCalls?: string;
  promptTokens?: number;
  completionTokens?: number;
}): Promise<Message> {
  const row = {
    completionTokens: input.completionTokens ?? null,
    content: input.content,
    conversationId: input.conversationId,
    createdAt: new Date(),
    error: input.error ?? null,
    id: crypto.randomUUID(),
    model: input.model ?? null,
    promptTokens: input.promptTokens ?? null,
    reasoning: input.reasoning ?? null,
    role: input.role,
    toolCalls: input.toolCalls ?? null,
    userId: input.userId,
  };

  await getDb().insert(messages).values(row);
  return row as Message;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function listAgents(userId: string): Promise<Agent[]> {
  return getDb()
    .select()
    .from(agents)
    .where(eq(agents.userId, userId))
    .orderBy(desc(agents.updatedAt));
}

export async function getAgent(userId: string, id: string): Promise<Agent | null> {
  const [row] = await getDb()
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createAgent(
  userId: string,
  input: {
    title: string;
    description?: string;
    systemRole?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  },
): Promise<Agent> {
  const now = new Date();
  const row = {
    avatar: null,
    backgroundColor: null,
    createdAt: now,
    description: input.description ?? null,
    id: crypto.randomUUID(),
    isPublic: false,
    maxTokens: input.maxTokens ?? 2048,
    model: input.model ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    plugins: '[]',
    slug: null,
    systemRole: input.systemRole ?? null,
    temperature: input.temperature ?? 0.7,
    title: input.title,
    topP: 1,
    updatedAt: now,
    userId,
  };

  await getDb().insert(agents).values(row);
  return row as Agent;
}
