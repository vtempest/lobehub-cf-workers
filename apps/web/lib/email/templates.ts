/**
 * Message bodies. Every template returns both a plain-text and an HTML part;
 * `buildMimeMessage` sends them as `multipart/alternative` so a text-only
 * client still gets a readable message.
 */
import { APP_NAME } from '../constants';

export interface EmailBody {
  subject: string;
  text: string;
  html: string;
}

/** Escape interpolated values so a display name cannot inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(heading: string, body: string, action?: { label: string; url: string }): string {
  const button = action
    ? `<p style="margin:32px 0"><a href="${escapeHtml(action.url)}" style="background:#000;border-radius:8px;color:#fff;display:inline-block;font-weight:600;padding:12px 20px;text-decoration:none">${escapeHtml(action.label)}</a></p>`
    : '';

  return `<!doctype html>
<html><body style="background:#fafafa;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;padding:32px">
<div style="background:#fff;border:1px solid #e5e5e5;border-radius:12px;margin:0 auto;max-width:520px;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
${body}
${button}
<p style="border-top:1px solid #eee;color:#888;font-size:12px;margin-top:32px;padding-top:16px">Sent by ${escapeHtml(APP_NAME)}. If you were not expecting this, you can ignore it.</p>
</div></body></html>`;
}

export function magicLinkEmail(url: string): EmailBody {
  return {
    html: layout(
      `Sign in to ${APP_NAME}`,
      '<p style="color:#444;line-height:1.6;margin:0">Use the button below to sign in. The link works once and expires shortly.</p>',
      { label: 'Sign in', url },
    ),
    subject: `Sign in to ${APP_NAME}`,
    text: `Sign in to ${APP_NAME}\n\nOpen this link to sign in. It works once and expires shortly.\n\n${url}\n\nIf you were not expecting this, you can ignore it.`,
  };
}

export function verificationEmail(url: string): EmailBody {
  return {
    html: layout(
      'Confirm your email address',
      '<p style="color:#444;line-height:1.6;margin:0">Confirm this address to finish setting up your account.</p>',
      { label: 'Confirm email', url },
    ),
    subject: `Confirm your email for ${APP_NAME}`,
    text: `Confirm your email address\n\nOpen this link to finish setting up your ${APP_NAME} account.\n\n${url}`,
  };
}

export function teamInvitationEmail(input: {
  inviterName: string;
  teamName: string;
  url: string;
}): EmailBody {
  return {
    html: layout(
      `${input.inviterName} invited you to ${input.teamName}`,
      `<p style="color:#444;line-height:1.6;margin:0">${escapeHtml(input.inviterName)} has invited you to join <strong>${escapeHtml(input.teamName)}</strong> on ${escapeHtml(APP_NAME)}.</p>`,
      { label: 'Accept invitation', url: input.url },
    ),
    subject: `${input.inviterName} invited you to ${input.teamName}`,
    text: `${input.inviterName} invited you to join ${input.teamName} on ${APP_NAME}.\n\nAccept the invitation:\n${input.url}`,
  };
}
