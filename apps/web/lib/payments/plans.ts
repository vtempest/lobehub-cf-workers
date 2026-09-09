/**
 * Subscription catalogue.
 *
 * `name` is the plan id Better Auth's Stripe plugin passes to Stripe, and
 * `priceId` the Stripe price it maps to. Both are read on the client (the plan
 * selector), so nothing secret belongs here.
 */

export interface Plan {
  id: number;
  /** Better Auth plan id. Lowercase, stable — it is stored on subscriptions. */
  name: string;
  /** Monthly price in whole currency units, for display only. */
  price: number;
  /** Stripe price id. Empty when billing is not configured. */
  priceId: string;
  /**
   * Stripe Payment Link for a one-click upgrade, used by the upgrade card in
   * settings. Empty when billing is not configured, which the card treats as
   * "no upgrade available" rather than navigating nowhere.
   */
  paymentURL: string;
  trialDays: number;
  features: string[];
  limits: { tokens: number; seats: number };
}

export const plans: Plan[] = [
  {
    features: [
      '1,000,000 tokens per month',
      'All Workers AI chat models',
      'Unlimited conversations',
      'File attachments up to 25 MB',
    ],
    id: 1,
    limits: { seats: 1, tokens: 1_000_000 },
    name: 'starter',
    paymentURL: process.env.NEXT_PUBLIC_STRIPE_LINK_STARTER ?? '',
    price: 9,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER ?? '',
    trialDays: 14,
  },
  {
    features: [
      '10,000,000 tokens per month',
      'Priority inference',
      'Custom agents with system prompts',
      'Team seats and shared conversations',
    ],
    id: 2,
    limits: { seats: 8, tokens: 10_000_000 },
    name: 'pro',
    paymentURL: process.env.NEXT_PUBLIC_STRIPE_LINK_PRO ?? '',
    price: 29,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? '',
    trialDays: 14,
  },
];

export function getPlan(name: string): Plan | undefined {
  return plans.find((plan) => plan.name === name);
}
