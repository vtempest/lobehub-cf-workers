/**
 * Better Auth server instance.
 *
 * Built lazily and cached per isolate: the D1 binding it needs only exists
 * inside a request, so constructing at module scope would fail during the
 * build and on any cold module graph walk. Every consumer imports the `auth`
 * proxy below, which resolves on first property access.
 *
 * Sign-in methods: Google (redirect OAuth *and* One Tap), Discord and LinkedIn
 * when their credentials are set, a mailed magic link, and an anonymous
 * session for trying the app first.
 *
 * Mappings and settings worth knowing about:
 *
 *   - `baseURL` is resolved per request against `lib/auth/hosts.ts` rather than
 *     pinned to one origin. A single string (or leaving it unset, which makes
 *     better-auth latch onto whichever host warmed the isolate first) means
 *     every request arriving on any other domain this Worker is served from —
 *     the `*.workers.dev` name, a preview version, a second custom domain — is
 *     rejected by the CSRF origin check with a 403 "Invalid origin" before it
 *     reaches the sign-in handler.
 *
 *   - Better Auth's models are singular (`user`, `session`, …); this schema's
 *     tables are plural, so each model carries a `modelName` rather than the
 *     tables being renamed under the rest of the app — and the adapter's
 *     `schema` map is keyed by those same plural names.
 *   - Stripe is the one non-Cloudflare dependency and is entirely optional.
 *     Without `STRIPE_SECRET_KEY` the plugin gets a proxy that throws on use,
 *     so billing endpoints fail with an explanation while sign-in — every other
 *     auth route — keeps working.
 */
import { stripe as stripePlugin } from '@better-auth/stripe';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous, magicLink, oneTap, openAPI } from 'better-auth/plugins';
import Stripe from 'stripe';

import { buildAllowedHosts, buildTrustedOrigins } from './auth/hosts';
import { OAUTH_STATE_COOKIE_MAX_AGE_SECONDS, SIGN_IN_ERROR_URL } from './auth/oauth-state';
import { getBindings, getEnv } from './cf/bindings';
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

/**
 * Providers are only registered when both halves of their credential pair are
 * present. Registering google with `clientId: undefined` — the previous
 * behaviour, which keyed only off `GOOGLE_CLIENT_ID` — leaves better-auth
 * advertising a provider that can only fail, including the One Tap callback,
 * which verifies the Google id token against the configured client id.
 */
function buildSocialProviders() {
  const socialProviders: Record<
    string,
    { clientId: string; clientSecret: string; scope?: string[] }
  > = {};

  const google = { id: getEnv('GOOGLE_CLIENT_ID'), secret: getEnv('GOOGLE_CLIENT_SECRET') };
  if (google.id && google.secret) {
    socialProviders.google = {
      clientId: google.id,
      clientSecret: google.secret,
      // Identity only. Pinning the list (rather than relying on the provider
      // default) keeps a first-time consent screen reading "name, email
      // address, profile picture" even if another feature later adds Google
      // scopes of its own; those are granted separately and incrementally.
      scope: ['openid', 'email', 'profile'],
    };
  }

  const pairs: [string, string, string][] = [
    ['discord', 'AUTH_DISCORD_ID', 'AUTH_DISCORD_SECRET'],
    ['linkedin', 'AUTH_LINKEDIN_ID', 'AUTH_LINKEDIN_SECRET'],
  ];

  for (const [provider, idKey, secretKey] of pairs) {
    const clientId = getEnv(idKey);
    const clientSecret = getEnv(secretKey);
    if (clientId && clientSecret) socialProviders[provider] = { clientId, clientSecret };
  }

  return socialProviders;
}

function buildAuth() {
  const env = getBindings();
  const stripeKey = env.STRIPE_SECRET_KEY;

  // An explicitly configured URL, when there is one. It is not the only origin
  // this instance answers on — see `baseURL` below — but it stays the fallback
  // and is always allowed.
  const configuredBaseURL = env.BETTER_AUTH_URL || BASE_URL || undefined;

  const allowedHosts = buildAllowedHosts({
    configuredBaseURL,
    extraHosts: env.BETTER_AUTH_ALLOWED_HOSTS,
  });

  const trustedOrigins = buildTrustedOrigins({
    configuredBaseURL,
    extraOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS,
  });

  return betterAuth({
    /**
     * A visitor can reach this app through several sign-in methods that share
     * one email (Google, One Tap, Discord, LinkedIn, magic link), and the same
     * person is expected to end up as one account. By default better-auth
     * refuses to link a new provider onto an existing account unless that
     * account's local `emailVerified` flag is already true — and Discord's
     * profile response does not always report a verified email, so an account
     * created there stays unverified and every later sign-in for the same
     * person (Google One Tap included) fails closed with a 401 "account not
     * linked", even though the incoming identity is independently verified.
     * Every method offered here already proves control of the email out of
     * band, so relaxing this is safe.
     */
    account: {
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: false,
        trustedProviders: ['google', 'discord', 'linkedin'],
      },
      modelName: 'accounts',
    },

    advanced: {
      cookies: {
        // The OAuth `state` cookie outlives better-auth's five-minute default
        // so it cannot expire while the state row it is checked against is
        // still valid — see ./auth/oauth-state.
        state: { attributes: { maxAge: OAUTH_STATE_COOKIE_MAX_AGE_SECONDS } },
      },
      // Per-request base URLs are derived from the Host header, and better-auth
      // prefers `x-forwarded-host` over it whenever proxy headers are trusted —
      // which it does by default. Nothing sits in front of this Worker to set
      // that header, so an attacker could supply their own and have the magic
      // link we email built for their domain. Cloudflare routes on Host, so
      // taking the host from the request itself is both correct and forgeable
      // only by someone who already controls a routed hostname.
      trustedProxyHeaders: false,
    },

    appName: APP_NAME,

    baseURL: {
      allowedHosts,
      // Used when the host is missing (a direct `auth.api` call with no
      // headers) or not allowlisted; the origin check then rejects the unknown
      // host, which is the intended answer.
      fallback: configuredBaseURL ?? BASE_URL,
    },

    /**
     * The schema map is keyed by the *mapped* model names — `accounts`, not
     * `account`. The adapter looks a model up after `modelName` has been
     * applied, so keying it by Better Auth's singular defaults leaves every
     * table unfindable; 1.7 catches that at init with a "Drizzle schema
     * mismatch: missing tables users, sessions, accounts, verifications"
     * rather than at the first query.
     */
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: { accounts, sessions, subscriptions, users, verifications },
    }),

    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: false,
      sendVerificationEmail: async ({ url, user }) => {
        await sendEmail({ ...verificationEmail(url), to: user.email });
      },
    },

    // A failed OAuth callback lands on the app's own /login rather than
    // better-auth's built-in error page — see ./auth/oauth-state.
    onAPIError: { errorURL: SIGN_IN_ERROR_URL },

    plugins: [
      // Google One Tap. The prompt itself is client-side (see
      // components/auth/one-tap.tsx); this is the endpoint that verifies the id
      // token Google hands back against `socialProviders.google.clientId`,
      // which is why the provider above must have both halves of its pair.
      oneTap(),
      openAPI(),
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
        // Same plural-table mapping as the core models above; the plugin owns
        // its own model, so it has to be told separately.
        schema: { subscription: { modelName: 'subscriptions' } },
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

    socialProviders: buildSocialProviders(),

    trustedOrigins,

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
 * Property-access proxy over `getAuth()`, so `auth.api.getSession(…)` works
 * without every call site building the instance.
 *
 * `has` is trapped as well as `get`: the proxy target is an empty object, so
 * without it `'handler' in auth` — which is how better-auth's helpers tell an
 * auth instance from a bare handler — answers false about a real instance.
 * Route handlers that need the instance itself use `getAuth()` directly.
 */
export const auth = new Proxy({} as Auth, {
  get(_target, property) {
    const value = Reflect.get(getAuth() as object, property);
    return typeof value === 'function' ? value.bind(getAuth()) : value;
  },
  has(_target, property) {
    return Reflect.has(getAuth() as object, property);
  },
}) as Auth;
