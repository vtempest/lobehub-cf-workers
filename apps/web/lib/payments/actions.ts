'use server';

/**
 * Billing server actions.
 *
 * Subscription state is mirrored into D1 by Better Auth's Stripe plugin, so
 * reads come from the local table (and therefore from the request's D1 session)
 * rather than from a Stripe round trip on every render. Only a plan *change*
 * talks to Stripe.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import Stripe from 'stripe';

import { requireSession } from '../auth/session';
import { getBindings } from '../cf/bindings';
import { getDb } from '../db';
import { subscriptions, type Subscription } from '../db/schema';

/** Statuses that entitle a user to their plan. */
const LIVE_STATUSES = ['active', 'trialing', 'past_due'];

export async function getActiveSubscription(): Promise<{ subscription: Subscription | null }> {
  let userId: string;
  try {
    userId = (await requireSession()).user.id;
  } catch {
    return { subscription: null };
  }

  const [row] = await getDb()
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.referenceId, userId),
        inArray(subscriptions.status, LIVE_STATUSES),
      ),
    )
    .orderBy(desc(subscriptions.periodEnd))
    .limit(1);

  return { subscription: row ?? null };
}

/**
 * Move an existing subscription onto a different price.
 *
 * Better Auth's client handles *new* checkouts; switching an existing
 * subscription is an update to the item in place, which keeps the billing
 * period and prorates rather than starting a second subscription.
 */
export async function updateExistingSubscription(
  subscriptionId: string,
  priceId: string,
): Promise<{ status: boolean; message: string }> {
  let userId: string;
  try {
    userId = (await requireSession()).user.id;
  } catch {
    return { message: 'You must be signed in to change your plan.', status: false };
  }

  const secretKey = getBindings().STRIPE_SECRET_KEY;
  if (!secretKey) {
    return {
      message: 'Billing is not configured for this deployment.',
      status: false,
    };
  }
  if (!priceId) {
    return { message: 'That plan has no Stripe price configured.', status: false };
  }

  // Confirm the subscription is this user's before touching Stripe, so a
  // guessed id cannot change someone else's plan.
  const [owned] = await getDb()
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.stripeSubscriptionId, subscriptionId),
        eq(subscriptions.referenceId, userId),
      ),
    )
    .limit(1);

  if (!owned) {
    return { message: 'Subscription not found.', status: false };
  }

  try {
    const stripe = new Stripe(secretKey);
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    const item = current.items.data[0];
    if (!item) {
      return { message: 'That subscription has no billable item to change.', status: false };
    }

    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: 'create_prorations',
    });

    return { message: 'Subscription updated.', status: true };
  } catch (error) {
    console.error('[billing] subscription update failed:', error);
    return {
      message: error instanceof Error ? error.message : 'Failed to update subscription.',
      status: false,
    };
  }
}
