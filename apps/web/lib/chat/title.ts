import { generateText } from '../ai/workers-ai';
import { UTILITY_MODEL } from '../ai/models';

/** Long enough to be useful in a sidebar, short enough not to wrap. */
const MAX_TITLE_LENGTH = 60;

const SYSTEM_PROMPT =
  'You write short titles for chat threads. Reply with a title of at most six words that ' +
  'names the topic. No quotation marks, no trailing punctuation, no preamble.';

/** Trim a model answer down to something that fits a sidebar row. */
function tidy(raw: string): string {
  const firstLine = raw.split('\n')[0] ?? '';
  const stripped = firstLine.trim().replace(/^["'`]|["'`.]$/g, '').trim();
  if (!stripped) return '';
  return stripped.length > MAX_TITLE_LENGTH
    ? `${stripped.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : stripped;
}

/** Fall back to the prompt itself when the model gives us nothing usable. */
function fromPrompt(prompt: string): string {
  const condensed = prompt.replace(/\s+/g, ' ').trim();
  if (!condensed) return 'New conversation';
  return condensed.length > MAX_TITLE_LENGTH
    ? `${condensed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : condensed;
}

/**
 * Name a thread from its first message.
 *
 * Called after the answer has streamed, so it never delays first token. A
 * failure here is cosmetic, so it degrades to a truncated prompt rather than
 * failing the turn.
 */
export async function generateTitle(prompt: string): Promise<string> {
  try {
    const answer = await generateText({
      maxTokens: 24,
      messages: [
        { content: SYSTEM_PROMPT, role: 'system' },
        { content: prompt, role: 'user' },
      ],
      model: UTILITY_MODEL,
      temperature: 0.3,
    });

    return tidy(answer) || fromPrompt(prompt);
  } catch {
    return fromPrompt(prompt);
  }
}
