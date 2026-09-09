/**
 * Better Auth server instance.
 *
 * Built lazily and cached per isolate: the D1 binding it needs only exists
 * inside a request, so constructing at module scope would fail during the
 * build and on any cold module graph walk. Every consumer imports the `auth`
 * proxy below, which resolves on first property access.
 *
 * Two mappings are worth knowing about:
 *
 *   - Better Auth's models are singular (`user`, `session`, …); this schema's
 *     tables are plural, so the adapter is given an explicit mapping rather
 *     than the tables being renamed under the rest of the app.
 *   - Stripe is the one non-Cloudflare dependency and is entirely optional.
 *     Without `STRIPE_SECRET_KEY` the plugin gets a proxy that throws on use,
 *     so billing endpoints fail with an explanation while sign-in — every other
 *     auth route — keeps working.
 */
import { stripe as stripePlugin } from '@better-auth/stripe';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous, magicLink } from 'better-auth/plugins';
import Stripe from 'stripe';

import { getBindings } from './cf/bindings';
import { APP_NAME, BASE_URL } from './constants';
import { getDb } from './db';
import {
  accounts,
  sessions,
  subscriptions,
  users,
  verifications,
} from './db/schema';
import { sendEmail } from './email/send';
import { magicLinkEmail, verificationEmail } from './email/templates';
import { plans } from './payments/plans';

/**
 * Stand-in for a Stripe client on a deployment with no key. Any billing call
 * throws with the reason; nothing else in the auth stack touches it.
 */
function unconfiguredStripe(): Stripe {
  const fail = () => {
    throw new Error(
      'Billing is not configured for this deployment. Set the STRIPE_SECRET_KEY secret to enable it.',
    );
  };

  return new Proxy({} as Stripe, {
    get: () =>
      new Proxy(function stripeUnavailable() {} as unknown as object, { apply: fail, get: fail }),
  });
}

function buildAuth() {
  const env = getBindings();
  const stripeKey = env.STRIPE_SECRET_KEY;

  return betterAuth({
    account: { modelName: 'accounts' },
    appName: APP_NAME,
    baseURL: env.BETTER_AUTH_URL ?? BASE_URL,

    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: {
        account: accounts,
        session: sessions,
        subscription: subscriptions,
        user: users,
        verification: verifications,
      },
    }),

    emailVerification: {
      sendVerificationEmail: async ({ url, user }) => {
        await sendEmail({ ...verificationEmail(url), to: user.email });
      },
    },

    plugins: [
      // Sign-in by mailed link. Possible at all because Email Routing gives the
      // Worker an outbound mail path.
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const result = await sendEmail({ ...magicLinkEmail(url), to: email });
          if (!result.delivered) {
            throw new Error(result.reason ?? 'Could not send the sign-in link');
          }
        },
      }),
      // Lets someone try the app before creating an account; the anonymous row
      // is upgraded in place when they sign in for real.
      anonymous(),
      stripePlugin({
        createCustomerOnSignUp: Boolean(stripeKey),
        stripeClient: stripeKey
          ? new Stripe(stripeKey)
          : unconfiguredStripe(),
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
        subscription: {
          enabled: true,
          plans: plans.map((plan) => ({
            freeTrial: plan.trialDays > 0 ? { days: plan.trialDays } : undefined,
            limits: plan.limits,
            name: plan.name,
            priceId: plan.priceId,
          })),
        },
      }),
    ],

    secret: env.BETTER_AUTH_SECRET,

    session: { modelName: 'sessions' },

    socialProviders: env.GOOGLE_CLIENT_ID
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
          },
        }
      : undefined,

    user: { modelName: 'users' },
    verification: { modelName: 'verifications' },
  });
}

export type Auth = ReturnType<typeof buildAuth>;

let cached: Auth | null = null;

/** The Better Auth instance for this request. */
export function getAuth(): Auth {
  if (!cached) cached = buildAuth();
  return cached;
}

/**
 * Property-access proxy over `getAuth()`, so `auth.api.getSession(…)` and
 * `toNextJsHandler(auth)` work without every call site building the instance.
 */
export const auth = new Proxy({} as Auth, {
  get(_target, property) {
    const value = Reflect.get(getAuth() as object, property);
    return typeof value === 'function' ? value.bind(getAuth()) : value;
  },
}) as Auth;
