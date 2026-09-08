/**
 * `cloudflare:email` is provided by the Workers runtime and is not covered by
 * @cloudflare/workers-types, so the constructor we use is declared here.
 *
 * @see https://developers.cloudflare.com/email-routing/email-workers/send-email/
 */
declare module 'cloudflare:email' {
  export class EmailMessage {
    constructor(from: string, to: string, raw: ReadableStream | string);
    readonly from: string;
    readonly to: string;
    readonly raw: ReadableStream | string;
  }
}
