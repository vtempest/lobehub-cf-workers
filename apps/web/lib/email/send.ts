/**
 * Outbound mail through Cloudflare Email Routing.
 *
 * `send_email` requires Email Routing on the sender's zone and delivers only to
 * addresses verified as destinations in the same account. Without the binding —
 * local dev, or an account with no Email Routing zone — this logs the message
 * and reports `delivered: false` rather than throwing, so sign-in and
 * invitations stay testable offline. Callers surface that outcome instead of
 * swallowing it.
 */
import { EmailMessage } from 'cloudflare:email';

import { tryGetBindings } from '../cf/bindings';
import { APP_EMAIL } from '../constants';
import { buildMimeMessage } from './mime';

export interface SendResult {
  delivered: boolean;
  /** Why nothing was sent, when `delivered` is false. */
  reason?: string;
}

export interface SendOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
}

export async function sendEmail(options: SendOptions): Promise<SendResult> {
  const binding = tryGetBindings()?.SEND_EMAIL;
  const from = options.from ?? APP_EMAIL;

  if (!binding) {
    console.info(
      `[email] SEND_EMAIL is not bound; not delivering "${options.subject}" to ${options.to}`,
    );
    return { delivered: false, reason: 'Email Routing is not configured for this deployment' };
  }

  const raw = buildMimeMessage({ ...options, from });

  try {
    await binding.send(new EmailMessage(from, options.to, raw));
    return { delivered: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown delivery failure';
    console.error(`[email] delivery to ${options.to} failed:`, error);
    return { delivered: false, reason };
  }
}
