/**
 * D1 (SQLite) schema.
 *
 * Timestamps are `integer({ mode: 'timestamp' })` — SQLite has no date type, so
 * drizzle stores them as Unix seconds and hands back `Date`. Booleans are
 * `integer({ mode: 'boolean' })` for the same reason.
 *
 * Better Auth's models are singular (`user`, `session`, `account`,
 * `verification`, `subscription`); the tables here are plural, and `lib/auth.ts`
 * maps between the two rather than renaming tables the rest of the app reads.
 *
 * Regenerate migrations with `bun run db:generate` after editing this file.
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  apiKey: text('api_key').unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  id: text('id').primaryKey(),
  image: text('image'),
  isAnonymous: integer('is_anonymous', { mode: 'boolean' }).default(false),
  name: text('name').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  usageCount: integer('usage_count').default(0),
});

export const sessions = sqliteTable('sessions', {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  id: text('id').primaryKey(),
  ipAddress: text('ip_address'),
  token: text('token').notNull().unique(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = sqliteTable('accounts', {
  accessToken: text('access_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  accountId: text('account_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  id: text('id').primaryKey(),
  idToken: text('id_token'),
  password: text('password'),
  providerId: text('provider_id').notNull(),
  refreshToken: text('refresh_token'),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

/**
 * Short-lived tokens: OAuth state, magic links, e-mail verification. These rows
 * are written by one request and read back by a different one seconds later,
 * which is why `/api/auth/*` never reads from a lagging D1 replica — see
 * `PRIMARY_ONLY_PATH_PREFIXES` in `./d1-session.ts`.
 */
export const verifications = sqliteTable('verifications', {
  createdAt: integer('created_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  value: text('value').notNull(),
});

export const userSettings = sqliteTable('user_settings', {
  anthropicApiKey: text('anthropic_api_key'),
  cloudflareApiKey: text('cloudflare_api_key'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  googleApiKey: text('google_api_key'),
  groqApiKey: text('groq_api_key'),
  id: text('id').primaryKey(),
  openaiApiKey: text('openai_api_key'),
  perplexityApiKey: text('perplexity_api_key'),
  togetheraiApiKey: text('togetherai_api_key'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  xaiApiKey: text('xai_api_key'),
});

export const walletAddresses = sqliteTable('wallet_addresses', {
  address: text('address').notNull().unique(),
  chainId: integer('chain_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  id: text('id').primaryKey(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const agents = sqliteTable(
  'agents',
  {
    avatar: text('avatar'),
    backgroundColor: text('background_color'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    description: text('description'),
    id: text('id').primaryKey(),
    isPublic: integer('is_public', { mode: 'boolean' }).default(false),
    maxTokens: integer('max_tokens').default(2048),
    model: text('model').notNull().default('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
    plugins: text('plugins').default('[]'),
    slug: text('slug'),
    systemRole: text('system_role'),
    temperature: real('temperature').default(0.7),
    title: text('title').notNull().default('Default Agent'),
    topP: real('top_p').default(1),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('agents_user_idx').on(table.userId),
    uniqueIndex('agents_user_slug_idx').on(table.userId, table.slug),
  ],
);

export const conversations = sqliteTable(
  'conversations',
  {
    agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    archived: integer('archived', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    id: text('id').primaryKey(),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
    pinned: integer('pinned', { mode: 'boolean' }).default(false),
    title: text('title').notNull().default('New conversation'),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    // Serves the sidebar read: one user's threads, most recent first.
    index('conversations_user_recent_idx').on(table.userId, table.lastMessageAt),
    index('conversations_agent_idx').on(table.agentId),
  ],
);

export const messages = sqliteTable(
  'messages',
  {
    completionTokens: integer('completion_tokens'),
    content: text('content').notNull().default(''),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    /** Set when a generation failed, so the transcript shows what happened. */
    error: text('error'),
    id: text('id').primaryKey(),
    model: text('model'),
    promptTokens: integer('prompt_tokens'),
    reasoning: text('reasoning'),
    role: text('role').notNull(),
    toolCalls: text('tool_calls'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  // Serves the transcript read: one thread, in order.
  (table) => [index('messages_conversation_idx').on(table.conversationId, table.createdAt)],
);

export const files = sqliteTable(
  'files',
  {
    contentType: text('content_type').notNull(),
    conversationId: text('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    id: text('id').primaryKey(),
    /** R2 object key. Only metadata lands in D1; bytes live in the bucket. */
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('files_user_idx').on(table.userId),
    index('files_conversation_idx').on(table.conversationId),
  ],
);

// ---------------------------------------------------------------------------
// Organizations and teams
// ---------------------------------------------------------------------------

export const organizations = sqliteTable('organizations', {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  description: text('description'),
  id: text('id').primaryKey(),
  image: text('image'),
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const organizationMembers = sqliteTable('organization_members', {
  id: text('id').primaryKey(),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const teams = sqliteTable('teams', {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  description: text('description'),
  id: text('id').primaryKey(),
  maxMembers: integer('max_members').default(8),
  name: text('name').notNull(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  upgradeMembers: integer('upgrade_members', { mode: 'boolean' }).default(false),
});

export const teamMembers = sqliteTable('team_members', {
  id: text('id').primaryKey(),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
  role: text('role').notNull().default('member'),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const userInvitations = sqliteTable('user_invitations', {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  email: text('email').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  id: text('id').primaryKey(),
  inviterId: text('inviter_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'cascade',
  }),
  status: text('status').notNull().default('pending'),
  teamId: text('team_id').references(() => teams.id, { onDelete: 'cascade' }),
});

// ---------------------------------------------------------------------------
// Social
// ---------------------------------------------------------------------------

export const userFollows = sqliteTable('user_follows', {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  followerId: text('follower_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  followingId: text('following_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  id: text('id').primaryKey(),
});

export const comments = sqliteTable('comments', {
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  editedAt: integer('edited_at', { mode: 'timestamp' }),
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  itemType: text('item_type').notNull(),
  parentCommentId: text('parent_comment_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const likes = sqliteTable('likes', {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  itemType: text('item_type').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const notifications = sqliteTable('notifications', {
  actionUrl: text('action_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  fromUserId: text('from_user_id').references(() => users.id, { onDelete: 'cascade' }),
  id: text('id').primaryKey(),
  message: text('message').notNull(),
  read: integer('read', { mode: 'boolean' }).default(false),
  relatedItemId: text('related_item_id'),
  relatedItemType: text('related_item_type'),
  title: text('title').notNull(),
  type: text('type').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

// ---------------------------------------------------------------------------
// Billing (Better Auth + Stripe)
// ---------------------------------------------------------------------------

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    billingInterval: text('billing_interval'),
    cancelAt: integer('cancel_at', { mode: 'timestamp' }),
    cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' }).default(false),
    canceledAt: integer('canceled_at', { mode: 'timestamp' }),
    endedAt: integer('ended_at', { mode: 'timestamp' }),
    id: text('id').primaryKey(),
    isAnonymous: integer('is_anonymous', { mode: 'boolean' }).default(false),
    periodEnd: integer('period_end', { mode: 'timestamp' }),
    periodStart: integer('period_start', { mode: 'timestamp' }),
    plan: text('plan').notNull(),
    referenceId: text('reference_id').notNull(),
    seats: integer('seats'),
    status: text('status').notNull().default('incomplete'),
    stripeCustomerId: text('stripe_customer_id'),
    stripeScheduleId: text('stripe_schedule_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    trialEnd: integer('trial_end', { mode: 'timestamp' }),
    trialStart: integer('trial_start', { mode: 'timestamp' }),
  },
  (table) => [
    index('subscriptions_reference_idx').on(table.referenceId),
    index('subscriptions_stripe_customer_idx').on(table.stripeCustomerId),
  ],
);

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
