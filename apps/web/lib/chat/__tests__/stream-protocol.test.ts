import { describe, expect, it } from 'vitest';

import { createEventParser, encodeEvent, type ChatStreamEvent } from '../stream-protocol';

const start: ChatStreamEvent = {
  assistantMessageId: 'a1',
  conversationId: 'c1',
  type: 'start',
  userMessageId: 'u1',
};

describe('chat stream protocol', () => {
  it('round-trips an event through the wire format', () => {
    const parse = createEventParser();
    expect(parse(encodeEvent(start))).toEqual([start]);
  });

  it('reads several frames out of one chunk', () => {
    const parse = createEventParser();
    const chunk = encodeEvent(start) + encodeEvent({ text: 'hi', type: 'delta' });
    expect(parse(chunk)).toEqual([start, { text: 'hi', type: 'delta' }]);
  });

  it('holds a frame split across chunks until the rest arrives', () => {
    const parse = createEventParser();
    const frame = encodeEvent({ text: 'hello', type: 'delta' });
    const split = Math.floor(frame.length / 2);

    expect(parse(frame.slice(0, split))).toEqual([]);
    expect(parse(frame.slice(split))).toEqual([{ text: 'hello', type: 'delta' }]);
  });

  it('keeps a trailing partial frame instead of emitting it early', () => {
    const parse = createEventParser();
    const chunk = `${encodeEvent(start)}data: {"type":"delta","te`;

    expect(parse(chunk)).toEqual([start]);
    expect(parse('xt":"x"}\n\n')).toEqual([{ text: 'x', type: 'delta' }]);
  });

  it('skips a malformed frame rather than throwing', () => {
    const parse = createEventParser();
    const chunk = `data: {not json}\n\n${encodeEvent({ text: 'ok', type: 'delta' })}`;
    expect(parse(chunk)).toEqual([{ text: 'ok', type: 'delta' }]);
  });

  it('preserves text that contains the frame delimiter', () => {
    const parse = createEventParser();
    const event: ChatStreamEvent = { text: 'line one\n\nline two', type: 'delta' };
    // JSON escapes the newlines, so the delimiter never appears raw on the wire.
    expect(parse(encodeEvent(event))).toEqual([event]);
  });
});
