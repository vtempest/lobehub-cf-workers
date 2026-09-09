/**
 * A minimal RFC 5322 MIME builder.
 *
 * Cloudflare Email Routing's `send_email` binding takes a raw message, not a
 * structured payload, so the envelope is assembled here. Only what this app
 * sends is covered: a single `multipart/alternative` body with a plain-text and
 * an HTML part.
 */

export interface MimeMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Printable US-ASCII, the only bytes a header may carry unencoded. */
const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

/**
 * Encode a header value that may contain non-ASCII, per RFC 2047. Plain ASCII
 * is passed through so ordinary subjects stay readable in transit.
 */
function encodeHeader(value: string): string {
  if (ASCII_PRINTABLE.test(value)) return value;
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(value)));
  return `=?UTF-8?B?${base64}?=`;
}

/**
 * A boundary that cannot appear in the parts it delimits: random, and prefixed
 * with characters that base64 body content never produces.
 */
function makeBoundary(): string {
  return `--_lobehub_${crypto.randomUUID().replace(/-/g, '')}`;
}

/** Base64 with the 76-character line wrapping that transfer encoding requires. */
function base64Body(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return (btoa(binary).match(/.{1,76}/g) ?? []).join('\r\n');
}

/** Build the raw message to hand to the `send_email` binding. */
export function buildMimeMessage(message: MimeMessage): string {
  const boundary = makeBoundary();

  return [
    `From: ${encodeHeader(message.from)}`,
    `To: ${encodeHeader(message.to)}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Message-ID: <${crypto.randomUUID()}@lobehub>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(message.text),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(message.html),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
